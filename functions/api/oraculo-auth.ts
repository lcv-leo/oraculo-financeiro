// Módulo: oraculo-financeiro/functions/api/oraculo-auth.ts
// Descrição: Autenticação por e-mail + token OTP para persistência opt-in de dados.
// Bindings: BIGDATA_DB (D1), RESEND_API_KEY (env var)

interface Env {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BIGDATA_DB: any
  RESEND_API_KEY: string
}

interface Ctx { env: Env; request: Request }

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

function generateOTP(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(array[0] % 1000000).padStart(6, '0')
}

async function sendTokenEmail(email: string, token: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Ensure tables exist ─────────────────────────────────────────────────────

async function ensureTables(db: Env['BIGDATA_DB']): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS oraculo_user_data (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      dados_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()

  await db.prepare(`
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
  `).run()
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export const onRequestPost = async ({ env, request }: Ctx) => {
  const db = env?.BIGDATA_DB
  if (!db || typeof db.prepare !== 'function') {
    return jsonResponse({ ok: false, error: 'Database indisponível.' }, 503)
  }

  const apiKey = env?.RESEND_API_KEY
  if (!apiKey) {
    return jsonResponse({ ok: false, error: 'RESEND_API_KEY não configurada.' }, 503)
  }

  await ensureTables(db)

  const body = await request.json() as { action: string; email?: string; token?: string; dados?: unknown }
  const action = body.action
  const email = (body.email ?? '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    return jsonResponse({ ok: false, error: 'E-mail inválido.' }, 400)
  }

  try {
    // ── SAVE: gera token → envia e-mail → salva dados temporariamente ───────
    if (action === 'save') {
      if (!body.dados) {
        return jsonResponse({ ok: false, error: 'Nenhum dado fornecido para salvar.' }, 400)
      }

      const token = generateOTP()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      const id = crypto.randomUUID()

      await db.prepare(
        `INSERT INTO oraculo_auth_tokens (id, email, token, action, dados_json, expires_at) VALUES (?, ?, ?, 'save', ?, ?)`
      ).bind(id, email, token, JSON.stringify(body.dados), expiresAt).run()

      const sent = await sendTokenEmail(email, token, apiKey)
      if (!sent) {
        return jsonResponse({ ok: false, error: 'Falha ao enviar e-mail. Tente novamente.' }, 502)
      }

      return jsonResponse({ ok: true, message: 'Código enviado para seu e-mail.' })
    }

    // ── VERIFY-SAVE: valida token → persiste dados ──────────────────────────
    if (action === 'verify-save') {
      const token = (body.token ?? '').trim()
      if (!token) return jsonResponse({ ok: false, error: 'Token não fornecido.' }, 400)

      const row = await db.prepare(
        `SELECT id, dados_json, expires_at FROM oraculo_auth_tokens 
         WHERE email = ? AND token = ? AND action = 'save' AND used = 0 
         ORDER BY created_at DESC LIMIT 1`
      ).bind(email, token).first()

      if (!row) return jsonResponse({ ok: false, error: 'Código inválido ou expirado.' }, 401)
      if (new Date(row.expires_at as string) < new Date()) {
        return jsonResponse({ ok: false, error: 'Código expirado. Solicite um novo.' }, 401)
      }

      // Marcar token como usado
      await db.prepare('UPDATE oraculo_auth_tokens SET used = 1 WHERE id = ?').bind(row.id).run()

      // Upsert dados do usuário
      const existingData = await db.prepare('SELECT id FROM oraculo_user_data WHERE email = ? LIMIT 1').bind(email).first()

      if (existingData) {
        await db.prepare(
          `UPDATE oraculo_user_data SET dados_json = ?, updated_at = datetime('now') WHERE email = ?`
        ).bind(row.dados_json, email).run()
      } else {
        const dataId = crypto.randomUUID()
        await db.prepare(
          `INSERT INTO oraculo_user_data (id, email, dados_json) VALUES (?, ?, ?)`
        ).bind(dataId, email, row.dados_json).run()
      }

      return jsonResponse({ ok: true, message: 'Dados salvos com sucesso.' })
    }

    // ── REQUEST-TOKEN: verifica se há dados → gera token → envia e-mail ─────
    if (action === 'request-token') {
      const existingData = await db.prepare(
        'SELECT id FROM oraculo_user_data WHERE email = ? LIMIT 1'
      ).bind(email).first()

      if (!existingData) {
        return jsonResponse({ ok: false, error: 'Nenhum dado encontrado para esse e-mail.' }, 404)
      }

      const token = generateOTP()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      const id = crypto.randomUUID()

      await db.prepare(
        `INSERT INTO oraculo_auth_tokens (id, email, token, action, expires_at) VALUES (?, ?, ?, 'retrieve', ?)`
      ).bind(id, email, token, expiresAt).run()

      const sent = await sendTokenEmail(email, token, apiKey)
      if (!sent) {
        return jsonResponse({ ok: false, error: 'Falha ao enviar e-mail. Tente novamente.' }, 502)
      }

      return jsonResponse({ ok: true, message: 'Código enviado para seu e-mail.' })
    }

    // ── RETRIEVE: valida token → retorna dados ──────────────────────────────
    if (action === 'retrieve') {
      const token = (body.token ?? '').trim()
      if (!token) return jsonResponse({ ok: false, error: 'Token não fornecido.' }, 400)

      const row = await db.prepare(
        `SELECT id, expires_at FROM oraculo_auth_tokens 
         WHERE email = ? AND token = ? AND action = 'retrieve' AND used = 0 
         ORDER BY created_at DESC LIMIT 1`
      ).bind(email, token).first()

      if (!row) return jsonResponse({ ok: false, error: 'Código inválido ou expirado.' }, 401)
      if (new Date(row.expires_at as string) < new Date()) {
        return jsonResponse({ ok: false, error: 'Código expirado. Solicite um novo.' }, 401)
      }

      // Marcar token como usado
      await db.prepare('UPDATE oraculo_auth_tokens SET used = 1 WHERE id = ?').bind(row.id).run()

      // Buscar dados
      const userData = await db.prepare(
        'SELECT dados_json FROM oraculo_user_data WHERE email = ? LIMIT 1'
      ).bind(email).first()

      if (!userData) return jsonResponse({ ok: false, error: 'Nenhum dado encontrado.' }, 404)

      return jsonResponse({ ok: true, dados: JSON.parse(userData.dados_json as string) })
    }

    return jsonResponse({ ok: false, error: `Ação desconhecida: ${action}` }, 400)

  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Erro interno.',
    }, 500)
  }
}
