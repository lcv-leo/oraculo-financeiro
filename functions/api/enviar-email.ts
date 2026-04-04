// Endpoint: POST /api/enviar-email
// Envia relatório de análise financeira por e-mail via Resend

interface Env {
  RESEND_API_KEY: string
}

interface Ctx { env: Env; request: Request }

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestPost = async ({ env, request }: Ctx) => {
  const envRec = env as unknown as Record<string, unknown>;
  const apiKey = (env?.RESEND_API_KEY || envRec['RESEND_APP_KEY'] || envRec['RESEND_APPKEY'] || envRec['resend-api-key'] || envRec['resend-appkey']) as string;
  if (!apiKey) return jsonResponse({ ok: false, error: 'RESEND_API_KEY não configurada.' }, 503)

  try {
    const body = await request.json() as { emailDestino?: string; relatorioHtml?: string; relatorioTexto?: string }
    const emailDestino = (body.emailDestino ?? '').trim()
    const relatorioHtml = body.relatorioHtml ?? ''
    const relatorioTexto = body.relatorioTexto ?? ''

    if (!emailDestino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestino)) {
      return jsonResponse({ ok: false, error: 'E-mail de destino inválido.' }, 400)
    }
    if (!relatorioHtml && !relatorioTexto) {
      return jsonResponse({ ok: false, error: 'Relatório vazio.' }, 400)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Oráculo Financeiro <oraculo-financeiro@lcv.app.br>',
        to: [emailDestino],
        subject: '📊 Sua Análise Financeira — Oráculo Financeiro',
        html: relatorioHtml,
        text: relatorioTexto,
      }),
    })

    if (res.ok) {
      return jsonResponse({ ok: true, message: 'E-mail enviado com sucesso!' })
    }
    const data = await res.json() as Record<string, unknown>
    return jsonResponse({ ok: false, error: String(data.message ?? 'Falha no envio.') }, 500)
  } catch {
    return jsonResponse({ ok: false, error: 'Falha interna na comunicação do e-mail.' }, 500)
  }
}
