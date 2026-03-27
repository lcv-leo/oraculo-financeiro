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
 * CSV real (7 colunas, separador ;):
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
function parseCSV(csvText: string): { titulos: TituloTD[]; totalLines: number } {
  const clean = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.trim().split('\n')
  if (lines.length < 2) return { titulos: [], totalLines: lines.length }

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

  if (!latestDateBR) return { titulos: [], totalLines: lines.length }

  // Passo 2: coletar somente IPCA+ na data mais recente
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

    const tipoLower = tipoTitulo.toLowerCase()
    const isIpca = tipoLower.includes('ipca') || tipoLower.includes('ntn-b')
    if (!isIpca) continue

    results.push({
      tipo: tipoTitulo,
      vencimento: dataVencimento,
      dataBase,
      taxaCompra: isNaN(taxaCompra) ? 0 : taxaCompra,
      taxaVenda: isNaN(taxaVenda) ? 0 : taxaVenda,
      pu: isNaN(puCompra) ? 0 : puCompra,
    })
  }

  return { titulos: results, totalLines: lines.length }
}

// ─── CRON HANDLER ─────────────────────────────────────────────────────────────

async function processarCSV(db: Env['BIGDATA_DB']): Promise<string> {
  const t0 = Date.now()
  const csvUrl = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv'

  console.log('[cron-taxa-ipca] Iniciando download do CSV do Tesouro Transparente...')

  const csvRes = await fetch(csvUrl)
  if (!csvRes.ok) {
    console.error(`[cron-taxa-ipca] Falha no download do CSV: HTTP ${csvRes.status} ${csvRes.statusText}`)
    throw new Error(`Falha ao baixar CSV: HTTP ${csvRes.status}`)
  }

  const csvText = await csvRes.text()
  const csvBytes = csvText.length
  console.log(`[cron-taxa-ipca] CSV baixado: ${(csvBytes / 1024 / 1024).toFixed(2)} MB`)

  const { titulos, totalLines } = parseCSV(csvText)
  console.log(`[cron-taxa-ipca] CSV parseado: ${totalLines} linhas, ${titulos.length} títulos IPCA+ encontrados`)

  if (titulos.length === 0) {
    console.error(`[cron-taxa-ipca] Nenhum título IPCA+ encontrado. Total de linhas no CSV: ${totalLines}`)
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

  console.log(`[cron-taxa-ipca] Dados processados: data_ref=${dataRef}, taxa_media=${taxaMedia}%, titulos=${titulos.length}`)

  // Upsert no cache D1
  await db.prepare(
    `INSERT INTO oraculo_taxa_ipca_cache (id, data_referencia, taxa_indicativa, vencimentos_json, atualizado_em)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_referencia = ?, taxa_indicativa = ?, vencimentos_json = ?, atualizado_em = ?`
  ).bind(
    'latest', dataRef, taxaMedia, vencimentosJson, agora,
    dataRef, taxaMedia, vencimentosJson, agora
  ).run()

  const elapsed = Date.now() - t0
  const resumo = `Cache atualizado: ${titulos.length} títulos IPCA+, taxa média ${taxaMedia}%, ref ${dataRef} (${elapsed}ms)`
  console.log(`[cron-taxa-ipca] Upsert D1 concluído. ${resumo}`)
  return resumo
}

// ─── WORKER EXPORT ────────────────────────────────────────────────────────────

export default {
  // Cron Trigger — executa diariamente às 05:00 UTC (02:00 BRT)
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[cron-taxa-ipca] ⏰ Cron trigger disparado: ${new Date().toISOString()}`)
    ctx.waitUntil(
      processarCSV(env.BIGDATA_DB)
        .then((msg) => console.log(`[cron-taxa-ipca] ✅ ${msg}`))
        .catch((err) => console.error(`[cron-taxa-ipca] ❌ ${err instanceof Error ? err.message : err}`))
    )
  },

  // Fallback HTTP — permite testar manualmente via GET
  async fetch(_request: Request, env: Env): Promise<Response> {
    console.log(`[cron-taxa-ipca] 🔧 Execução manual via HTTP: ${new Date().toISOString()}`)
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
