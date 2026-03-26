// Módulo: oraculo-financeiro/functions/api/taxa-ipca-atual.ts
// Versão: v01.03.00
// Descrição: Busca a taxa IPCA+ indicativa atual via ANBIMA Feed API (mercado-secundario-TPF).
// Autenticação OAuth2 com client_credentials grant. Filtra NTN-B (Tesouro IPCA+).

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Env {
  ANBIMA_CLIENT_ID: string
  ANBIMA_CLIENT_SECRET: string
}

interface Context {
  env: Env
  request: Request
}

interface AnbimaTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface AnbimaTitulo {
  tipo_titulo: string
  expressao: string
  data_vencimento: string
  data_referencia: string
  codigo_selic: string
  taxa_compra: number
  taxa_venda: number
  taxa_indicativa: number
  pu: number
  codigo_isin: string
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600', // Cache 1h — dado atualizado 1x/dia às 20h
    },
  })
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export const onRequestGet = async ({ env }: Context) => {
  const clientId = env?.ANBIMA_CLIENT_ID
  const clientSecret = env?.ANBIMA_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return jsonResponse({ ok: false, error: 'Credenciais ANBIMA não configuradas (ANBIMA_CLIENT_ID / ANBIMA_CLIENT_SECRET).' }, 503)
  }

  try {
    // ── 1. Obter Access Token via OAuth2 (client_credentials) ──────────────
    const basicAuth = btoa(`${clientId}:${clientSecret}`)

    const tokenRes = await fetch('https://api.anbima.com.br/oauth/access-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      return jsonResponse({ ok: false, error: `Falha na autenticação ANBIMA (${tokenRes.status}): ${errText}` }, 502)
    }

    const tokenData = await tokenRes.json() as AnbimaTokenResponse
    const accessToken = tokenData.access_token

    // ── 2. Buscar taxas do mercado secundário de títulos públicos ──────────
    const tpfRes = await fetch('https://api.anbima.com.br/feed/precos-indices/v1/titulos-publicos/mercado-secundario-TPF', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'client_id': clientId,
        'access_token': accessToken,
      },
    })

    if (!tpfRes.ok) {
      const errText = await tpfRes.text()
      return jsonResponse({ ok: false, error: `Falha ao consultar ANBIMA TPF (${tpfRes.status}): ${errText}` }, 502)
    }

    const titulos = await tpfRes.json() as AnbimaTitulo[]

    // ── 3. Filtrar NTN-B (Tesouro IPCA+) e extrair taxas indicativas ──────
    const ntnbTitulos = titulos.filter((t) =>
      t.tipo_titulo === 'NTN-B' || t.tipo_titulo === 'NTN-B Principal'
    )

    if (ntnbTitulos.length === 0) {
      return jsonResponse({ ok: false, error: 'Nenhum título NTN-B encontrado nos dados da ANBIMA.' }, 404)
    }

    // Montar resposta com todos os vencimentos disponíveis
    const taxas = ntnbTitulos.map((t) => ({
      tipo: t.tipo_titulo,
      vencimento: t.data_vencimento,
      dataReferencia: t.data_referencia,
      taxaIndicativa: t.taxa_indicativa,
      taxaCompra: t.taxa_compra,
      taxaVenda: t.taxa_venda,
      pu: t.pu,
      isin: t.codigo_isin,
    }))

    // Taxa média indicativa de todas as NTN-B (aproximação para input do cálculo de MTM)
    const taxaMedia = taxas.reduce((sum, t) => sum + t.taxaIndicativa, 0) / taxas.length

    return jsonResponse({
      ok: true,
      dataReferencia: ntnbTitulos[0].data_referencia,
      taxaMediaIndicativa: Math.round(taxaMedia * 100) / 100,
      titulos: taxas,
    })
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Erro interno ao consultar ANBIMA.',
    }, 500)
  }
}
