type D1Result<T = unknown> = { results?: T[] }

interface D1Prepared {
  bind: (...args: unknown[]) => {
    run: () => Promise<unknown>
  }
  all: () => Promise<D1Result>
  run: () => Promise<unknown>
}

interface D1DatabaseLike {
  prepare: (query: string) => D1Prepared
}

interface Env {
  BIGDATA_DB: D1DatabaseLike
}

interface Context {
  env: Env
  request: Request
}

type Recomendacao = 'vender' | 'manter'

type LoteTesouro = {
  id: string
  criadoEm: string
  dataCompra: string
  valorInvestido: number
  taxaContratada: number
  vencimento: string
  taxaAtual: number
  diasParaMenorIr: number
  sinal: Recomendacao
  analise: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  })
}

function getDbOrThrow(env: Env) {
  const db = env?.BIGDATA_DB
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Binding BIGDATA_DB ausente.')
  }

  return db
}

export const onRequestGet = async ({ env }: Context) => {
  try {
    const db = getDbOrThrow(env)

    const { results } = await db.prepare(
      `SELECT
        id,
        created_at AS criadoEm,
        data_compra AS dataCompra,
        valor_investido AS valorInvestido,
        taxa_contratada AS taxaContratada,
        COALESCE(vencimento, '') AS vencimento,
        taxa_atual AS taxaAtual,
        dias_para_menor_ir AS diasParaMenorIr,
        recomendacao,
        observacao
       FROM oraculo_tesouro_ipca_lotes
       ORDER BY datetime(created_at) DESC
       LIMIT 200`
    ).all()

    const data = ((results ?? []) as Array<{
      id: string
      criadoEm: string
      dataCompra: string
      valorInvestido: number
      taxaContratada: number
      vencimento: string
      taxaAtual: number
      diasParaMenorIr: number
      recomendacao: Recomendacao
      observacao: string
    }>).map((item) => ({
      id: item.id,
      criadoEm: item.criadoEm,
      dataCompra: item.dataCompra,
      valorInvestido: item.valorInvestido,
      taxaContratada: item.taxaContratada,
      vencimento: item.vencimento ?? '',
      taxaAtual: item.taxaAtual,
      diasParaMenorIr: item.diasParaMenorIr,
      sinal: item.recomendacao,
      analise: item.observacao
    })) as LoteTesouro[]

    return jsonResponse({ ok: true, data })
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao buscar lotes do Tesouro IPCA+.'
      },
      500
    )
  }
}

export const onRequestPost = async ({ env, request }: Context) => {
  try {
    const db = getDbOrThrow(env)
    const payload = (await request.json()) as Partial<LoteTesouro>

    const dataCompra = String(payload.dataCompra ?? '').trim()
    const valorInvestido = Number(payload.valorInvestido)
    const taxaContratada = Number(payload.taxaContratada)
    const vencimento = String(payload.vencimento ?? '').trim()
    const taxaAtual = Number(payload.taxaAtual)
    const diasParaMenorIr = Number(payload.diasParaMenorIr)
    const recomendacao = String(payload.sinal ?? '').trim() as Recomendacao
    const observacao = String(payload.analise ?? '').trim()

    if (!dataCompra || [valorInvestido, taxaContratada, taxaAtual, diasParaMenorIr].some((n) => Number.isNaN(n))) {
      return jsonResponse({ ok: false, error: 'Payload inválido para lote Tesouro IPCA+.' }, 400)
    }

    if (!['vender', 'manter'].includes(recomendacao)) {
      return jsonResponse({ ok: false, error: 'Recomendação inválida.' }, 400)
    }

    const id = crypto.randomUUID()
    const criadoEm = new Date().toISOString()

    await db.prepare(
      `INSERT INTO oraculo_tesouro_ipca_lotes (
        id,
        created_at,
        data_compra,
        valor_investido,
        taxa_contratada,
        vencimento,
        taxa_atual,
        dias_para_menor_ir,
        recomendacao,
        observacao
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    )
      .bind(
        id,
        criadoEm,
        dataCompra,
        valorInvestido,
        taxaContratada,
        vencimento,
        taxaAtual,
        diasParaMenorIr,
        recomendacao,
        observacao
      )
      .run()

    return jsonResponse(
      {
        ok: true,
        data: {
          id,
          criadoEm,
          dataCompra,
          valorInvestido,
          taxaContratada,
          vencimento,
          taxaAtual,
          diasParaMenorIr,
          sinal: recomendacao,
          analise: observacao
        }
      },
      201
    )
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao salvar lote do Tesouro IPCA+.'
      },
      500
    )
  }
}

export const onRequestDelete = async ({ env, request }: Context) => {
  try {
    const db = getDbOrThrow(env)
    const url = new URL(request.url)
    const id = String(url.searchParams.get('id') ?? '').trim()

    if (!id) {
      return jsonResponse({ ok: false, error: 'Parâmetro id é obrigatório para exclusão.' }, 400)
    }

    await db.prepare('DELETE FROM oraculo_tesouro_ipca_lotes WHERE id = ?1').bind(id).run()
    return jsonResponse({ ok: true })
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao excluir lote do Tesouro IPCA+.'
      },
      500
    )
  }
}
