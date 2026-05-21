// Módulo: oraculo-financeiro/functions/api/oraculo-auth.ts
// Descrição: Autenticação por e-mail + token OTP para persistência opt-in de dados.
// Sessão: após OTP bem-sucedido, gera session token (UUID) com TTL de 60 minutos.
// Bindings: BIGDATA_DB (D1), RESEND_API_KEY (env var ou Secrets Store resolvido no _middleware.ts)

import {
  type D1DatabaseLike,
  enforceRateLimit,
  hashToken,
  jsonResponse,
  requireAllowedOrigin,
} from './_shared/security';

interface Env {
  BIGDATA_DB: D1DatabaseLike;
  RESEND_API_KEY: string;
}

interface Ctx {
  env: Env;
  request: Request;
}

function generateOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String((array[0] ?? 0) % 1000000).padStart(6, '0');
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutos

function resolveResendApiKey(env: Env): string | null {
  const envRec = env as unknown as Record<string, unknown>;
  const candidate =
    env?.RESEND_API_KEY ||
    envRec.RESEND_APP_KEY ||
    envRec.RESEND_APPKEY ||
    envRec['resend-api-key'] ||
    envRec['resend-appkey'];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

/** Gera um session token (UUID) com TTL de 60 minutos após OTP bem-sucedido */
async function createSessionToken(db: Env['BIGDATA_DB'], email: string): Promise<string> {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const id = crypto.randomUUID();
  const tokenHash = await hashToken(sessionToken);
  await db
    .prepare(`INSERT INTO oraculo_auth_tokens (id, email, token, action, expires_at) VALUES (?, ?, ?, 'session', ?)`)
    .bind(id, email, tokenHash, expiresAt)
    .run();
  return sessionToken;
}

async function sendTokenEmail(email: string, token: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Oráculo Financeiro <oraculo-financeiro@lcv.app.br>',
        to: [email],
        subject: 'Seu código de verificação — Oráculo Financeiro',
        html: `
          <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #0d0d0d; margin-bottom: 8px;">Oráculo Financeiro</h2>
            <p style="color: #514b48; margin-bottom: 24px;">Use o código abaixo para verificar sua identidade:</p>
            <div style="background: #f5f4f4; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a73e8;">${token}</span>
            </div>
            <p style="color: #888; font-size: 13px;">Este código expira em 10 minutos. Se você não solicitou, ignore este e-mail.</p>
          </div>
        `,
      }),
    });
    return res.ok;
  } catch (error) {
    console.error('oraculo-auth:sendTokenEmail', error);
    return false;
  }
}

// ─── Ensure tables exist ─────────────────────────────────────────────────────

async function ensureTables(db: Env['BIGDATA_DB']): Promise<void> {
  await db
    .prepare(`
    CREATE TABLE IF NOT EXISTS oraculo_user_data (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      dados_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
    .run();

  await db
    .prepare(`
    CREATE TABLE IF NOT EXISTS oraculo_auth_tokens (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      action TEXT NOT NULL,
      dados_json TEXT,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
    .run();

  // Self-healing: add email columns to individual tables if missing
  try {
    await db.prepare(`ALTER TABLE oraculo_tesouro_ipca_lotes ADD COLUMN email TEXT DEFAULT ''`).run();
  } catch {
    /* exists */
  }
  try {
    await db.prepare(`ALTER TABLE oraculo_lci_cdb_registros ADD COLUMN email TEXT DEFAULT ''`).run();
  } catch {
    /* exists */
  }
}

// ─── Vincular email nos registros individuais referenciados no JSON ───────────

async function stampEmailOnRecords(db: Env['BIGDATA_DB'], email: string, dadosJson: string): Promise<void> {
  try {
    const dados = JSON.parse(dadosJson);

    const tesouroIds = (dados.tesouroRegistros ?? [])
      .map((r: { id?: string }) => r.id)
      .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
    const lciIds = (dados.lciRegistros ?? [])
      .map((r: { id?: string }) => r.id)
      .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);

    for (const rid of tesouroIds) {
      await db.prepare('UPDATE oraculo_tesouro_ipca_lotes SET email = ? WHERE id = ?').bind(email, rid).run();
    }
    for (const rid of lciIds) {
      await db.prepare('UPDATE oraculo_lci_cdb_registros SET email = ? WHERE id = ?').bind(email, rid).run();
    }
  } catch {
    // Falha no stamping não deve bloquear o flow principal
  }
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

const ACTIONS_REQUIRING_EMAIL = new Set(['save', 'request-token', 'request-delete-token']);

export const onRequestPost = async ({ env, request }: Ctx) => {
  try {
    const originError = requireAllowedOrigin(request);
    if (originError) return originError;

    const db = env?.BIGDATA_DB;
    if (!db || typeof db.prepare !== 'function') {
      return jsonResponse({ ok: false, error: 'Database indisponível.' }, 503);
    }

    const rateLimitError = await enforceRateLimit(request, db, 'auth');
    if (rateLimitError) return rateLimitError;

    await ensureTables(db);

    let body: { action?: string; email?: string; token?: string; dados?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: 'Payload JSON inválido.' }, 400);
    }

    const action = body.action;
    const email = (body.email ?? '').trim().toLowerCase();

    if (!email?.includes('@')) {
      return jsonResponse({ ok: false, error: 'E-mail inválido.' }, 400);
    }

    // RESEND_API_KEY só é necessária para ações que enviam e-mail.
    let apiKey: string | null = null;
    if (action && ACTIONS_REQUIRING_EMAIL.has(action)) {
      apiKey = resolveResendApiKey(env);
      if (!apiKey) {
        return jsonResponse({ ok: false, error: 'Serviço de e-mail indisponível.' }, 503);
      }
    }

    // ── SAVE: gera token → envia e-mail → salva dados temporariamente ───────
    if (action === 'save') {
      if (!body.dados) {
        return jsonResponse({ ok: false, error: 'Nenhum dado fornecido para salvar.' }, 400);
      }

      const token = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const id = crypto.randomUUID();
      const tokenHash = await hashToken(token);

      await db
        .prepare(
          `INSERT INTO oraculo_auth_tokens (id, email, token, action, dados_json, expires_at) VALUES (?, ?, ?, 'save', ?, ?)`,
        )
        .bind(id, email, tokenHash, JSON.stringify(body.dados), expiresAt)
        .run();

      const sent = await sendTokenEmail(email, token, apiKey as string);
      if (!sent) {
        return jsonResponse({ ok: false, error: 'Falha ao enviar e-mail. Tente novamente.' }, 502);
      }

      return jsonResponse({ ok: true, message: 'Código enviado para seu e-mail.' });
    }

    // ── VERIFY-SAVE: valida token → persiste dados → vincula email ───────
    if (action === 'verify-save') {
      const token = (body.token ?? '').trim();
      if (!token) return jsonResponse({ ok: false, error: 'Token não fornecido.' }, 400);
      const tokenHash = await hashToken(token);

      const row = await db
        .prepare(
          `SELECT id, dados_json, expires_at FROM oraculo_auth_tokens
         WHERE email = ? AND token IN (? , ?) AND action = 'save' AND used = 0
         ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(email, token, tokenHash)
        .first();

      if (!row) return jsonResponse({ ok: false, error: 'Código inválido ou expirado.' }, 401);
      if (new Date(row.expires_at as string) < new Date()) {
        return jsonResponse({ ok: false, error: 'Código expirado. Solicite um novo.' }, 401);
      }

      // Consumo atômico do OTP (evita race em verificações concorrentes)
      const consume = (await db
        .prepare('UPDATE oraculo_auth_tokens SET used = 1 WHERE id = ? AND used = 0')
        .bind(row.id)
        .run()) as { meta?: { changes?: number } };
      if (!consume?.meta || (consume.meta.changes ?? 0) === 0) {
        return jsonResponse({ ok: false, error: 'Código já utilizado.' }, 401);
      }

      // Upsert dados do usuário
      const existingData = await db
        .prepare('SELECT id FROM oraculo_user_data WHERE email = ? LIMIT 1')
        .bind(email)
        .first();

      if (existingData) {
        await db
          .prepare(`UPDATE oraculo_user_data SET dados_json = ?, updated_at = datetime('now') WHERE email = ?`)
          .bind(row.dados_json, email)
          .run();
      } else {
        const dataId = crypto.randomUUID();
        await db
          .prepare(`INSERT INTO oraculo_user_data (id, email, dados_json) VALUES (?, ?, ?)`)
          .bind(dataId, email, row.dados_json)
          .run();
      }

      // Vincular email nos registros individuais (ownership)
      await stampEmailOnRecords(db, email, row.dados_json as string);

      // Gerar session token para persistência de sessão (60 min)
      const sessionToken = await createSessionToken(db, email);

      return jsonResponse({ ok: true, message: 'Dados salvos com sucesso.', sessionToken });
    }

    // ── REQUEST-TOKEN: verifica se há dados → gera token → envia e-mail ─────
    if (action === 'request-token') {
      const existingData = await db
        .prepare('SELECT id FROM oraculo_user_data WHERE email = ? LIMIT 1')
        .bind(email)
        .first();

      if (!existingData) {
        return jsonResponse({ ok: true, message: 'Se houver dados vinculados a este e-mail, um código será enviado.' });
      }

      const token = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const id = crypto.randomUUID();
      const tokenHash = await hashToken(token);

      await db
        .prepare(
          `INSERT INTO oraculo_auth_tokens (id, email, token, action, expires_at) VALUES (?, ?, ?, 'retrieve', ?)`,
        )
        .bind(id, email, tokenHash, expiresAt)
        .run();

      const sent = await sendTokenEmail(email, token, apiKey as string);
      if (!sent) {
        return jsonResponse({ ok: false, error: 'Falha ao enviar e-mail. Tente novamente.' }, 502);
      }

      return jsonResponse({ ok: true, message: 'Código enviado para seu e-mail.' });
    }

    // ── RETRIEVE: valida token → retorna dados ──────────────────────────
    if (action === 'retrieve') {
      const token = (body.token ?? '').trim();
      if (!token) return jsonResponse({ ok: false, error: 'Token não fornecido.' }, 400);
      const tokenHash = await hashToken(token);

      const row = await db
        .prepare(
          `SELECT id, expires_at FROM oraculo_auth_tokens
         WHERE email = ? AND token IN (?, ?) AND action = 'retrieve' AND used = 0
         ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(email, token, tokenHash)
        .first();

      if (!row) return jsonResponse({ ok: false, error: 'Código inválido ou expirado.' }, 401);
      if (new Date(row.expires_at as string) < new Date()) {
        return jsonResponse({ ok: false, error: 'Código expirado. Solicite um novo.' }, 401);
      }

      const consume = (await db
        .prepare('UPDATE oraculo_auth_tokens SET used = 1 WHERE id = ? AND used = 0')
        .bind(row.id)
        .run()) as { meta?: { changes?: number } };
      if (!consume?.meta || (consume.meta.changes ?? 0) === 0) {
        return jsonResponse({ ok: false, error: 'Código já utilizado.' }, 401);
      }

      // Buscar dados
      const userData = await db
        .prepare('SELECT dados_json FROM oraculo_user_data WHERE email = ? LIMIT 1')
        .bind(email)
        .first();

      if (!userData) return jsonResponse({ ok: false, error: 'Nenhum dado encontrado.' }, 404);

      // Gerar session token para persistência de sessão (60 min)
      const sessionToken = await createSessionToken(db, email);

      return jsonResponse({ ok: true, dados: JSON.parse(userData.dados_json as string), sessionToken });
    }

    // ── SESSION-RETRIEVE: valida session token (sem OTP) → retorna dados ────
    if (action === 'session-retrieve') {
      const sessionTokenInput = (body.token ?? '').trim();
      if (!sessionTokenInput) return jsonResponse({ ok: false, error: 'Session token não fornecido.' }, 400);
      const sessionTokenHash = await hashToken(sessionTokenInput);

      const row = await db
        .prepare(
          `SELECT id, email, expires_at FROM oraculo_auth_tokens
         WHERE token IN (?, ?) AND action = 'session' AND used = 0
         ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(sessionTokenInput, sessionTokenHash)
        .first();

      if (!row) return jsonResponse({ ok: false, error: 'Sessão inválida ou expirada.' }, 401);

      // Verificar se o email bate (defesa em profundidade)
      if ((row.email as string).toLowerCase() !== email) {
        return jsonResponse({ ok: false, error: 'Sessão não corresponde ao e-mail.' }, 401);
      }

      // Verificar expiração
      if (new Date(row.expires_at as string) < new Date()) {
        await db.prepare('UPDATE oraculo_auth_tokens SET used = 1 WHERE id = ?').bind(row.id).run();
        return jsonResponse({ ok: false, error: 'Sessão expirada. Autentique-se novamente.' }, 401);
      }

      // Buscar dados do usuário
      const userData = await db
        .prepare('SELECT dados_json FROM oraculo_user_data WHERE email = ? LIMIT 1')
        .bind(email)
        .first();

      if (!userData) return jsonResponse({ ok: false, error: 'Nenhum dado encontrado.' }, 404);

      // Renovar session token (gerar novo, invalidar antigo) — atômico
      const consume = (await db
        .prepare('UPDATE oraculo_auth_tokens SET used = 1 WHERE id = ? AND used = 0')
        .bind(row.id)
        .run()) as { meta?: { changes?: number } };
      if (!consume?.meta || (consume.meta.changes ?? 0) === 0) {
        return jsonResponse({ ok: false, error: 'Sessão já renovada em outra aba.' }, 401);
      }
      const newSessionToken = await createSessionToken(db, email);

      return jsonResponse({
        ok: true,
        dados: JSON.parse(userData.dados_json as string),
        sessionToken: newSessionToken,
      });
    }

    // ── REQUEST-DELETE-TOKEN: gera token para exclusão de dados ──────────
    if (action === 'request-delete-token') {
      const existingData = await db
        .prepare('SELECT id FROM oraculo_user_data WHERE email = ? LIMIT 1')
        .bind(email)
        .first();

      if (!existingData) {
        return jsonResponse({ ok: true, message: 'Se houver dados vinculados a este e-mail, um código será enviado.' });
      }

      const token = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const id = crypto.randomUUID();
      const tokenHash = await hashToken(token);

      await db
        .prepare(`INSERT INTO oraculo_auth_tokens (id, email, token, action, expires_at) VALUES (?, ?, ?, 'delete', ?)`)
        .bind(id, email, tokenHash, expiresAt)
        .run();

      const sent = await sendTokenEmail(email, token, apiKey as string);
      if (!sent) {
        return jsonResponse({ ok: false, error: 'Falha ao enviar e-mail. Tente novamente.' }, 502);
      }

      return jsonResponse({ ok: true, message: 'Código de confirmação enviado para seu e-mail.' });
    }

    // ── VERIFY-DELETE: valida token → apaga TODOS os dados do usuário ────
    if (action === 'verify-delete') {
      const token = (body.token ?? '').trim();
      if (!token) return jsonResponse({ ok: false, error: 'Token não fornecido.' }, 400);
      const tokenHash = await hashToken(token);

      const row = await db
        .prepare(
          `SELECT id, expires_at FROM oraculo_auth_tokens
         WHERE email = ? AND token IN (?, ?) AND action = 'delete' AND used = 0
         ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(email, token, tokenHash)
        .first();

      if (!row) return jsonResponse({ ok: false, error: 'Código inválido ou expirado.' }, 401);
      if (new Date(row.expires_at as string) < new Date()) {
        return jsonResponse({ ok: false, error: 'Código expirado. Solicite um novo.' }, 401);
      }

      const consume = (await db
        .prepare('UPDATE oraculo_auth_tokens SET used = 1 WHERE id = ? AND used = 0')
        .bind(row.id)
        .run()) as { meta?: { changes?: number } };
      if (!consume?.meta || (consume.meta.changes ?? 0) === 0) {
        return jsonResponse({ ok: false, error: 'Código já utilizado.' }, 401);
      }

      // Cascata completa por email — todas as tabelas
      await db.prepare('DELETE FROM oraculo_tesouro_ipca_lotes WHERE email = ?').bind(email).run();
      await db.prepare('DELETE FROM oraculo_lci_cdb_registros WHERE email = ?').bind(email).run();
      await db.prepare('DELETE FROM oraculo_user_data WHERE email = ?').bind(email).run();
      await db.prepare('DELETE FROM oraculo_auth_tokens WHERE email = ?').bind(email).run();

      return jsonResponse({ ok: true, message: 'Todos os seus dados foram excluídos permanentemente.' });
    }

    return jsonResponse({ ok: false, error: `Ação desconhecida: ${action ?? ''}` }, 400);
  } catch (error) {
    console.error('oraculo-auth:onRequestPost', error);
    return jsonResponse({ ok: false, error: 'Erro interno.' }, 500);
  }
};
