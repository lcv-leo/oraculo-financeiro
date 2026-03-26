// Worker: cron-taxa-ipca
// Descrição: Cron Trigger que baixa o CSV do Tesouro Transparente toda madrugada (02h BRT / 05h UTC)
// e pré-aquece o cache D1 (oraculo_taxa_ipca_cache) para que o frontend sempre leia instantaneamente.
// Deploy separado do Pages: `npx wrangler deploy --config workers/cron-taxa-ipca/wrangler.json`

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Env {
  BIGDATA_DB: any // eslint-disable-line @typescript-eslint/no-explicit-any -- Cloudflare D1 binding
}

interface TituloTD {
  tipo: string
  vencimento: string
  dataBase: string
  taxaCompra: number
  taxaVenda: number
  pu: number
}

// ─── CSV PARSER ───────────────────────────────────────────────────────────────

/**
 * Parseia o CSV do Tesouro Transparente e extrai os registros mais recentes de Tesouro IPCA+.
 *
 * Colunas (separador ;):
 * Tipo Titulo;Titulo Publico;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
 */
function parseCSV(csvText: string): TituloTD[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const results: TituloTD[] = []
  let latestDate = ''

  // Percorre de trás para frente até encontrar todas as linhas da data mais recente
  for (let i = lines.length - 1; i >= 1; i--) {
    const cols = lines[i].split(';')
    if (cols.length < 6) continue

    const tipoTitulo = cols[0].trim()
    const tituloPublico = cols[1]?.trim() ?? ''
    const dataVencimento = cols[2]?.trim() ?? ''
    const dataBase = cols[3]?.trim() ?? ''
    const taxaCompra = parseFloat((cols[4] ?? '0').replace(',', '.'))
    const taxaVenda = parseFloat((cols[5] ?? '0').replace(',', '.'))
    const puCompra = parseFloat((cols[6] ?? '0').replace(',', '.'))

    if (!dataBase) continue
    if (!latestDate) latestDate = dataBase
    if (dataBase !== latestDate) break

    const isIpca = tipoTitulo === 'Tesouro IPCA+' ||
      tipoTitulo === 'Tesouro IPCA+ com Juros Semestrais' ||
      tituloPublico.includes('IPCA+')

    if (isIpca) {
      results.push({
        tipo: tipoTitulo,
        vencimento: dataVencimento,
        dataBase,
        taxaCompra: isNaN(taxaCompra) ? 0 : taxaCompra,
        taxaVenda: isNaN(taxaVenda) ? 0 : taxaVenda,
        pu: isNaN(puCompra) ? 0 : puCompra,
      })
    }
  }

  return results
}

// ─── CRON HANDLER ─────────────────────────────────────────────────────────────

async function processarCSV(db: Env['BIGDATA_DB']): Promise<string> {
  const csvUrl = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv'

  const csvRes = await fetch(csvUrl)
  if (!csvRes.ok) {
    throw new Error(`Falha ao baixar CSV: HTTP ${csvRes.status}`)
  }

  const csvText = await csvRes.text()
  const titulos = parseCSV(csvText)

  if (titulos.length === 0) {
    throw new Error('Nenhum título IPCA+ encontrado no CSV')
  }

  // Calcular taxa média de compra
  const taxasValidas = titulos.filter((t) => t.taxaCompra > 0)
  const taxaMedia = taxasValidas.length > 0
    ? Math.round(taxasValidas.reduce((sum, t) => sum + t.taxaCompra, 0) / taxasValidas.length * 100) / 100
    : 0

  const dataRef = titulos[0].dataBase
  const vencimentosJson = JSON.stringify(titulos)
  const agora = new Date().toISOString()

  // Upsert no cache D1
  await db.prepare(
    `INSERT INTO oraculo_taxa_ipca_cache (id, data_referencia, taxa_indicativa, vencimentos_json, atualizado_em)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_referencia = ?, taxa_indicativa = ?, vencimentos_json = ?, atualizado_em = ?`
  ).bind(
    'latest', dataRef, taxaMedia, vencimentosJson, agora,
    dataRef, taxaMedia, vencimentosJson, agora
  ).run()

  return `Cache atualizado: ${titulos.length} títulos IPCA+, taxa média ${taxaMedia}%, ref ${dataRef}`
}

// ─── WORKER EXPORT ────────────────────────────────────────────────────────────

export default {
  // Cron Trigger — executa diariamente às 05:00 UTC (02:00 BRT)
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      processarCSV(env.BIGDATA_DB)
        .then((msg) => console.log(`[cron-taxa-ipca] ✅ ${msg}`))
        .catch((err) => console.error(`[cron-taxa-ipca] ❌ ${err instanceof Error ? err.message : err}`))
    )
  },

  // Fallback HTTP — permite testar manualmente via GET
  async fetch(_request: Request, env: Env): Promise<Response> {
    try {
      const msg = await processarCSV(env.BIGDATA_DB)
      return new Response(JSON.stringify({ ok: true, message: msg }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Erro interno' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  },
}
