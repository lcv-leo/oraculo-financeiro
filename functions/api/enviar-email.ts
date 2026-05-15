// Endpoint: POST /api/enviar-email
// Envia relatório de análise financeira por e-mail via Resend

import {
  type D1DatabaseLike,
  enforceRateLimit,
  jsonResponse,
  requireAllowedOrigin,
  sanitizeRichEmailHtml,
} from './_shared/security';

interface Env {
  RESEND_API_KEY: string;
  BIGDATA_DB: D1DatabaseLike;
}

interface Ctx {
  env: Env;
  request: Request;
}

export const onRequestPost = async ({ env, request }: Ctx) => {
  try {
    const originError = requireAllowedOrigin(request);
    if (originError) return originError;

    const rateLimitError = await enforceRateLimit(request, env.BIGDATA_DB, 'enviar_email');
    if (rateLimitError) return rateLimitError;

    const envRec = env as unknown as Record<string, unknown>;
    const candidate =
      env?.RESEND_API_KEY ||
      envRec.RESEND_APP_KEY ||
      envRec.RESEND_APPKEY ||
      envRec['resend-api-key'] ||
      envRec['resend-appkey'];
    const apiKey = typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
    if (!apiKey) return jsonResponse({ ok: false, error: 'Serviço de e-mail indisponível.' }, 503);

    let body: { emailDestino?: string; relatorioHtml?: string; relatorioTexto?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: 'Payload JSON inválido.' }, 400);
    }
    const emailDestino = (body.emailDestino ?? '').trim();
    const relatorioHtml = sanitizeRichEmailHtml(body.relatorioHtml ?? '');
    const relatorioTexto = body.relatorioTexto ?? '';

    if (!emailDestino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestino)) {
      return jsonResponse({ ok: false, error: 'E-mail de destino inválido.' }, 400);
    }
    if (!relatorioHtml && !relatorioTexto) {
      return jsonResponse({ ok: false, error: 'Relatório vazio.' }, 400);
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Oráculo Financeiro <oraculo-financeiro@lcv.app.br>',
        to: [emailDestino],
        subject: '📊 Sua Análise Financeira — Oráculo Financeiro',
        html: relatorioHtml,
        text: relatorioTexto,
      }),
    });

    if (res.ok) {
      return jsonResponse({ ok: true, message: 'E-mail enviado com sucesso!' });
    }
    const data = (await res.json().catch(() => ({}) as Record<string, unknown>)) as Record<string, unknown>;
    return jsonResponse({ ok: false, error: String(data.message ?? 'Falha no envio.') }, 502);
  } catch (error) {
    console.error('enviar-email:onRequestPost', error);
    return jsonResponse({ ok: false, error: 'Erro interno.' }, 500);
  }
};
