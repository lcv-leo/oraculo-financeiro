import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  getClientIp,
  hashToken,
  isAllowedLcvOrigin,
  jsonResponse,
  requireAllowedOrigin,
  sanitizeRichEmailHtml,
} from './security'

const createRequest = (origin?: string, extraHeaders: Record<string, string> = {}) => {
  const headers = new Headers(extraHeaders)
  if (origin) headers.set('Origin', origin)
  return new Request('https://oraculo-financeiro.lcv.app.br/api/teste', { headers })
}

describe('security helpers', () => {
  it('aceita apenas origens https em lcv.app.br', () => {
    expect(isAllowedLcvOrigin('https://oraculo-financeiro.lcv.app.br')).toBe(true)
    expect(isAllowedLcvOrigin('https://admin.lcv.app.br')).toBe(true)
    expect(isAllowedLcvOrigin('http://oraculo-financeiro.lcv.app.br')).toBe(false)
    expect(isAllowedLcvOrigin('https://evil.com')).toBe(false)
  })

  it('bloqueia origem explícita não permitida e aceita Origin válido', async () => {
    const invalidOrigin = requireAllowedOrigin(createRequest('https://evil.com'))
    const allowedOrigin = requireAllowedOrigin(createRequest('https://oraculo-financeiro.lcv.app.br'))

    expect(invalidOrigin?.status).toBe(403)
    expect(await invalidOrigin?.json()).toEqual({ ok: false, error: 'Origem não permitida.' })
    expect(allowedOrigin).toBeNull()
  })

  it('aceita request sem Origin quando Sec-Fetch-Site é same-origin ou same-site', () => {
    const sameOrigin = requireAllowedOrigin(createRequest(undefined, { 'Sec-Fetch-Site': 'same-origin' }))
    const sameSite = requireAllowedOrigin(createRequest(undefined, { 'Sec-Fetch-Site': 'same-site' }))

    expect(sameOrigin).toBeNull()
    expect(sameSite).toBeNull()
  })

  it('bloqueia request sem Origin e sem Sec-Fetch-Site seguro', async () => {
    const noSignals = requireAllowedOrigin(createRequest())
    const crossSite = requireAllowedOrigin(createRequest(undefined, { 'Sec-Fetch-Site': 'cross-site' }))
    const none = requireAllowedOrigin(createRequest(undefined, { 'Sec-Fetch-Site': 'none' }))

    expect(noSignals?.status).toBe(403)
    expect(crossSite?.status).toBe(403)
    expect(none?.status).toBe(403)
    expect(await noSignals?.json()).toEqual({ ok: false, error: 'Origem não permitida.' })
  })

  it('gera JSON response com headers de segurança', async () => {
    const response = jsonResponse({ ok: true }, 201, { 'X-Test': 'ok' })

    expect(response.status).toBe(201)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('X-Test')).toBe('ok')
    expect(await response.json()).toEqual({ ok: true })
  })

  it('extrai IP priorizando cabeçalhos do Cloudflare', () => {
    expect(getClientIp(createRequest(undefined, { 'CF-Connecting-IP': '1.2.3.4' }))).toBe('1.2.3.4')
    expect(getClientIp(createRequest(undefined, { 'X-Forwarded-For': '5.6.7.8, 9.9.9.9' }))).toBe('5.6.7.8')
    expect(getClientIp(createRequest())).toBe('unknown')
  })

  it('faz escape de HTML perigoso e remove payloads ativos de e-mail rico', () => {
    expect(escapeHtml('<b>"x"&\'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;')

    const dirtyHtml = '<div onclick="alert(1)"><script>alert(1)</script><iframe src="x"></iframe><a href="javascript:alert(2)">ok</a></div>'
    const sanitized = sanitizeRichEmailHtml(dirtyHtml)

    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('<iframe')
    expect(sanitized).not.toContain('onclick=')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).toContain('<div><a href="alert(2)">ok</a></div>')
  })

  it('gera hash determinístico para tokens', async () => {
    const first = await hashToken('token-seguro')
    const second = await hashToken('token-seguro')
    const third = await hashToken('token-diferente')

    expect(first).toHaveLength(64)
    expect(first).toBe(second)
    expect(first).not.toBe(third)
  })
})
