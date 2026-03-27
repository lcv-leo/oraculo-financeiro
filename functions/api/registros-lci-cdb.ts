type D1Result<T = unknown> = { results?: T[] }

interface D1Prepared {
  bind: (...args: unknown[]) => {
    run: () => Promise<unknown>
    all: () => Promise<D1Result>
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

type RegistroLciCdb = {
  id: string
  criadoEm: string
  prazoDias: number
  taxaLciLca: number
  aporte: number
  aliquotaIr: number
  cdbEquivalente: number
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
    throw new Error(
      'Binding BIGDATA_DB ausente. Configure a D1 bigdata_db no Cloudflare Pages (Production environment).'
    )
  }

  return db
}

// GET handler REMOVIDO por segurança.\r
// Dados de usuário NÃO podem ser servidos publicamente.\r
// Acesso somente via fluxo autenticado (oraculo-auth.ts → retrieve).\r

export const onRequestPost = async ({ env, request }: Context) => {
  try {
    const db = getDbOrThrow(env)

    const payload = (await request.json()) as Partial<RegistroLciCdb>

    const prazoDias = Number(payload.prazoDias)
    const taxaLciLca = Number(payload.taxaLciLca)
    const aporte = Number(payload.aporte)
    const cdbEquivalente = Number(payload.cdbEquivalente)
    const email = String((payload as Record<string, unknown>).email ?? '').trim().toLowerCase()

    if ([prazoDias, taxaLciLca, aporte, cdbEquivalente].some((value) => Number.isNaN(value) || value < 0)) {
      return jsonResponse({ ok: false, error: 'Payload inválido para registro LCI/CDB.' }, 400)
    }

    // Self-healing: add email column if missing
    try { await db.prepare(`ALTER TABLE oraculo_lci_cdb_registros ADD COLUMN email TEXT DEFAULT ''`).run() } catch { /* exists */ }

    const id = crypto.randomUUID()
    const criadoEm = new Date().toISOString()

    await db.prepare(
      `INSERT INTO oraculo_lci_cdb_registros (id, created_at, prazo_dias, taxa_cdi, aporte, rendimento_bruto, email)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
      .bind(id, criadoEm, prazoDias, taxaLciLca, aporte, cdbEquivalente, email)
      .run()

    const aliquotaIr = prazoDias <= 180 ? 22.5 : prazoDias <= 360 ? 20 : prazoDias <= 720 ? 17.5 : 15

    return jsonResponse(
      {
        ok: true,
        data: {
          id,
          criadoEm,
          prazoDias,
          taxaLciLca,
          aporte,
          aliquotaIr,
          cdbEquivalente
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
    const db = getDbOrThrow(env)

    const url = new URL(request.url)
    const id = String(url.searchParams.get('id') ?? '').trim()

    if (!id) {
      return jsonResponse({ ok: false, error: 'Parâmetro id é obrigatório para exclusão.' }, 400)
    }

    await db.prepare('DELETE FROM oraculo_lci_cdb_registros WHERE id = ?1')
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
