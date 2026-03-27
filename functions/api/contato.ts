// Endpoint: POST /api/contato
// Envia formulário de contato via Resend

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
  const apiKey = env?.RESEND_API_KEY
  if (!apiKey) return jsonResponse({ ok: false, error: 'RESEND_API_KEY não configurada.' }, 503)

  try {
    const body = await request.json() as { name?: string; phone?: string; email?: string; message?: string }
    const name = (body.name ?? '').trim()
    const phone = (body.phone ?? '').trim()
    const email = (body.email ?? '').trim()
    const message = (body.message ?? '').trim()

    if (!name || !email || !message) {
      return jsonResponse({ ok: false, error: 'Nome, e-mail e mensagem são obrigatórios.' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, error: 'E-mail inválido.' }, 400)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Oráculo Financeiro <oraculo-financeiro@lcv.app.br>',
        to: ['oraculo-financeiro@lcv.app.br'],
        reply_to: email,
        subject: `📬 Contato — ${name}`,
        html: `
          <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #0d0d0d; margin: 0 0 24px;">Nova mensagem de contato</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <tr><td style="padding: 8px 0; color: #888; width: 100px;">Nome</td><td style="padding: 8px 0; font-weight: 700;">${name}</td></tr>
              <tr><td style="padding: 8px 0; color: #888;">E-mail</td><td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #1a73e8;">${email}</a></td></tr>
              ${phone ? `<tr><td style="padding: 8px 0; color: #888;">Telefone</td><td style="padding: 8px 0;">${phone}</td></tr>` : ''}
            </table>
            <div style="background: #f5f4f4; border-radius: 12px; padding: 20px; color: #0d0d0d; line-height: 1.6;">
              ${message.replace(/\n/g, '<br>')}
            </div>
          </div>
        `,
      }),
    })

    if (res.ok) {
      return jsonResponse({ ok: true, message: 'Mensagem enviada com sucesso!' })
    }
    const data = await res.json() as Record<string, unknown>
    return jsonResponse({ ok: false, error: String(data.message ?? 'Falha no envio.') }, 500)
  } catch {
    return jsonResponse({ ok: false, error: 'Falha interna.' }, 500)
  }
}
