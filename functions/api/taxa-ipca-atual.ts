// Módulo: oraculo-financeiro/functions/api/taxa-ipca-atual.ts
// Versão: v01.03.01
// Descrição: Busca a taxa IPCA+ mais recente via CSV público do Tesouro Transparente (dados abertos).
// Fonte: https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto
// Cache: D1 (oraculo_taxa_ipca_cache) — evita download de ~13 MB a cada request.

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Env {
  BIGDATA_DB: any // Cloudflare D1 binding
}

interface Context {
  env: Env
  request: Request
}

interface TaxaIpcaCache {
  data_referencia: string
  taxa_indicativa: number
  vencimentos_json: string
  atualizado_em: string
}

interface TituloTD {
  tipo: string
  vencimento: string
  dataBase: string
  taxaCompra: number
  taxaVenda: number
  pu: number
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

/**
 * CSV real do Tesouro Transparente (7 colunas):
 * cols[0] = Tipo Titulo       (ex: "Tesouro IPCA+")
 * cols[1] = Data Vencimento    (ex: "15/08/2040")
 * cols[2] = Data Base          (ex: "25/03/2026")
 * cols[3] = Taxa Compra Manha  (ex: "7,16")
 * cols[4] = Taxa Venda Manha   (ex: "7,28")
 * cols[5] = PU Compra Manha    (ex: "1724,41")
 * cols[6] = PU Venda Manha     (ex: "1696,38")
 *
 * ATENÇÃO: dados NÃO são cronológicos — precisa scan completo.
 */
function parseCSV(csvText: string): TituloTD[] {
  const clean = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.trim().split('\n')
  if (lines.length < 2) return []

  // Converter data BR (dd/mm/yyyy) para comparável (yyyymmdd)
  function dateKey(dataBR: string): string {
    const [d, m, y] = dataBR.split('/')
    return `${y}${m}${d}`
  }

  // Passo 1: scan completo para encontrar a data base mais recente
  let latestDateKey = ''
  let latestDateBR = ''
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';')
    if (cols.length < 5) continue
    const dataBase = cols[2]?.trim() ?? ''
    if (!dataBase || !dataBase.includes('/')) continue
    const dk = dateKey(dataBase)
    if (dk > latestDateKey) {
      latestDateKey = dk
      latestDateBR = dataBase
    }
  }

  if (!latestDateBR) return []

  // Passo 2: coletar IPCA+ Principal na data mais recente
  const results: TituloTD[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';')
    if (cols.length < 5) continue

    const tipoTitulo = cols[0].trim()
    const dataVencimento = cols[1]?.trim() ?? ''
    const dataBase = cols[2]?.trim() ?? ''
    const taxaCompra = parseFloat((cols[3] ?? '0').replace(',', '.'))
    const taxaVenda = parseFloat((cols[4] ?? '0').replace(',', '.'))
    const puCompra = parseFloat((cols[5] ?? '0').replace(',', '.'))

    if (dataBase !== latestDateBR) continue

    // Filtrar: Tesouro IPCA+ (principal) — exclui "com Juros Semestrais"
    if (tipoTitulo !== 'Tesouro IPCA+') continue

    results.push({
      tipo: tipoTitulo,
      vencimento: dataVencimento,
      dataBase,
      taxaCompra: isNaN(taxaCompra) ? 0 : taxaCompra,
      taxaVenda: isNaN(taxaVenda) ? 0 : taxaVenda,
      pu: isNaN(puCompra) ? 0 : puCompra,
    })
  }
  return results
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export const onRequestGet = async ({ env, request }: Context) => {
  const db = env?.BIGDATA_DB
  if (!db || typeof db.prepare !== 'function') {
    return jsonResponse({ ok: false, error: 'Database binding (BIGDATA_DB) indisponível.' }, 503)
  }

  // Suporte a ?force=true para bypass do cache (trigger manual via admin-app)
  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get('force') === 'true'

  try {
    // ── 1. Verificar cache D1 (válido se atualizado hoje) ───────────────────
    const hoje = new Date().toISOString().slice(0, 10)

    const cacheRow = await db.prepare(
      'SELECT data_referencia, taxa_indicativa, vencimentos_json, atualizado_em FROM oraculo_taxa_ipca_cache WHERE id = ? LIMIT 1'
    ).bind('latest').first<TaxaIpcaCache>()

    if (!forceRefresh && cacheRow && cacheRow.atualizado_em?.startsWith(hoje)) {
      // Cache válido — retornar sem baixar CSV
      return jsonResponse({
        ok: true,
        fonte: 'cache',
        dataReferencia: cacheRow.data_referencia,
        taxaMediaIndicativa: cacheRow.taxa_indicativa,
        titulos: JSON.parse(cacheRow.vencimentos_json),
      })
    }

    // ── 2. Baixar CSV do Tesouro Transparente ────────────────────────────────
    const csvUrl = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv'

    const csvRes = await fetch(csvUrl)
    if (!csvRes.ok) {
      // Se falhar e tiver cache antigo, retornar o cache
      if (cacheRow) {
        return jsonResponse({
          ok: true,
          fonte: 'cache-stale',
          dataReferencia: cacheRow.data_referencia,
          taxaMediaIndicativa: cacheRow.taxa_indicativa,
          titulos: JSON.parse(cacheRow.vencimentos_json),
        })
      }
      return jsonResponse({ ok: false, error: `Falha ao baixar CSV do Tesouro Transparente (HTTP ${csvRes.status}).` }, 502)
    }

    const csvText = await csvRes.text()

    // ── 3. Parsear CSV e extrair NTN-B mais recentes ─────────────────────────
    const titulos = parseCSV(csvText)

    if (titulos.length === 0) {
      if (cacheRow) {
        return jsonResponse({
          ok: true,
          fonte: 'cache-stale',
          dataReferencia: cacheRow.data_referencia,
          taxaMediaIndicativa: cacheRow.taxa_indicativa,
          titulos: JSON.parse(cacheRow.vencimentos_json),
        })
      }
      return jsonResponse({ ok: false, error: 'Nenhum título IPCA+ encontrado no CSV.' }, 404)
    }

    // ── 4. Calcular taxa média e salvar no cache D1 ──────────────────────────
    // Usar taxaCompra como referência (é a taxa que o investidor contrata na compra)
    const taxasValidas = titulos.filter((t) => t.taxaCompra > 0)
    const taxaMedia = taxasValidas.length > 0
      ? Math.round(taxasValidas.reduce((sum, t) => sum + t.taxaCompra, 0) / taxasValidas.length * 100) / 100
      : 0

    const dataRef = titulos[0].dataBase
    const vencimentosJson = JSON.stringify(titulos)

    await db.prepare(
      `INSERT INTO oraculo_taxa_ipca_cache (id, data_referencia, taxa_indicativa, vencimentos_json, atualizado_em)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data_referencia = ?, taxa_indicativa = ?, vencimentos_json = ?, atualizado_em = ?`
    ).bind(
      'latest', dataRef, taxaMedia, vencimentosJson, new Date().toISOString(),
      dataRef, taxaMedia, vencimentosJson, new Date().toISOString()
    ).run()

    return jsonResponse({
      ok: true,
      fonte: 'tesouro-transparente',
      dataReferencia: dataRef,
      taxaMediaIndicativa: taxaMedia,
      titulos,
    })
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Erro interno ao consultar Tesouro Transparente.',
    }, 500)
  }
}
