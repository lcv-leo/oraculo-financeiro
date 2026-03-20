type D1Result<T = unknown> = { results?: T[] }

interface D1Prepared {
  bind: (...args: unknown[]) => {
    run: () => Promise<unknown>
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

type Risco = 'baixo' | 'medio' | 'alto'

type RegistroAuditoria = {
  id: string
  criadoEm: string
  observacao: string
  risco: Risco
  recomendacao: string
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

export const onRequestGet = async ({ env }: Context) => {
  try {
    const { results } = await env.FINANCEIRO_DB.prepare(
      `SELECT
        id,
        created_at AS criadoEm,
        observacao,
        risco,
        recomendacao
       FROM auditorias_ia
       ORDER BY datetime(created_at) DESC
       LIMIT 25`
    ).all()

    const data = (results ?? []) as RegistroAuditoria[]

    return jsonResponse({ ok: true, data })
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao buscar auditorias.'
      },
      500
    )
  }
}

export const onRequestPost = async ({ env, request }: Context) => {
  try {
    const payload = (await request.json()) as Partial<RegistroAuditoria>

    const observacao = String(payload.observacao ?? '').trim()
    const risco = String(payload.risco ?? '').trim() as Risco
    const recomendacao = String(payload.recomendacao ?? '').trim()

    if (!observacao || !recomendacao || !['baixo', 'medio', 'alto'].includes(risco)) {
      return jsonResponse({ ok: false, error: 'Payload inválido para auditoria IA.' }, 400)
    }

    const id = crypto.randomUUID()
    const criadoEm = new Date().toISOString()

    await env.FINANCEIRO_DB.prepare(
      `INSERT INTO auditorias_ia (id, created_at, observacao, risco, recomendacao)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
      .bind(id, criadoEm, observacao, risco, recomendacao)
      .run()

    return jsonResponse(
      {
        ok: true,
        data: {
          id,
          criadoEm,
          observacao,
          risco,
          recomendacao
        }
      },
      201
    )
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao salvar auditoria IA.'
      },
      500
    )
  }
}
