type D1Result<T = unknown> = { results?: T[] }

interface D1Prepared {
  bind: (...args: unknown[]) => {
    run: () => Promise<unknown>
    all: () => Promise<D1Result>
  }
  all: () => Promise<D1Result>
}

interface D1DatabaseLike {
  prepare: (query: string) => D1Prepared
}

interface Env {
  FINANCEIRO_DB: D1DatabaseLike
}

interface Context {
  env: Env
  request: Request
}

type RegistroLciCdb = {
  id: string
  criadoEm: string
  prazoDias: number
  taxaCdi: number
  aporte: number
  rendimentoBruto: number
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

export const onRequestGet = async ({ env, request }: Context) => {
  try {
    const requestUrl = new URL(request.url)
    const limitParam = Number(requestUrl.searchParams.get('limit') ?? 25)
    const offsetParam = Number(requestUrl.searchParams.get('offset') ?? 0)

    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 100) : 25
    const offset = Number.isFinite(offsetParam) ? Math.max(Math.trunc(offsetParam), 0) : 0

    const countResult = await env.FINANCEIRO_DB.prepare(
      'SELECT COUNT(*) AS total FROM lci_cdb_registros'
    ).all()

    const total = Number((countResult.results?.[0] as { total?: number } | undefined)?.total ?? 0)

    const { results } = await env.FINANCEIRO_DB.prepare(
      `SELECT
        id,
        created_at AS criadoEm,
        prazo_dias AS prazoDias,
        taxa_cdi AS taxaCdi,
        aporte,
        rendimento_bruto AS rendimentoBruto
       FROM lci_cdb_registros
       ORDER BY datetime(created_at) DESC
       LIMIT ?1 OFFSET ?2`
    )
      .bind(limit, offset)
      .all()

    const data = (results ?? []) as RegistroLciCdb[]

    return jsonResponse({ ok: true, data, total, limit, offset })
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao buscar registros LCI/CDB.'
      },
      500
    )
  }
}

export const onRequestPost = async ({ env, request }: Context) => {
  try {
    const payload = (await request.json()) as Partial<RegistroLciCdb>

    const prazoDias = Number(payload.prazoDias)
    const taxaCdi = Number(payload.taxaCdi)
    const aporte = Number(payload.aporte)
    const rendimentoBruto = Number(payload.rendimentoBruto)

    if ([prazoDias, taxaCdi, aporte, rendimentoBruto].some((value) => Number.isNaN(value) || value < 0)) {
      return jsonResponse({ ok: false, error: 'Payload inválido para registro LCI/CDB.' }, 400)
    }

    const id = crypto.randomUUID()
    const criadoEm = new Date().toISOString()

    await env.FINANCEIRO_DB.prepare(
      `INSERT INTO lci_cdb_registros (id, created_at, prazo_dias, taxa_cdi, aporte, rendimento_bruto)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
      .bind(id, criadoEm, prazoDias, taxaCdi, aporte, rendimentoBruto)
      .run()

    return jsonResponse(
      {
        ok: true,
        data: {
          id,
          criadoEm,
          prazoDias,
          taxaCdi,
          aporte,
          rendimentoBruto
        }
      },
      201
    )
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao salvar registro LCI/CDB.'
      },
      500
    )
  }
}

export const onRequestDelete = async ({ env, request }: Context) => {
  try {
    const url = new URL(request.url)
    const id = String(url.searchParams.get('id') ?? '').trim()

    if (!id) {
      return jsonResponse({ ok: false, error: 'Parâmetro id é obrigatório para exclusão.' }, 400)
    }

    await env.FINANCEIRO_DB.prepare('DELETE FROM lci_cdb_registros WHERE id = ?1')
      .bind(id)
      .run()

    return jsonResponse({ ok: true })
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao excluir registro LCI/CDB.'
      },
      500
    )
  }
}
