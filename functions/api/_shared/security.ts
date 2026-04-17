export interface D1Prepared {
  bind: (...args: unknown[]) => {
    run: () => Promise<unknown>
    all?: () => Promise<unknown>
    first?: <T = Record<string, unknown>>() => Promise<T | null>
  }
  run: () => Promise<unknown>
  all?: () => Promise<unknown>
  first?: <T = Record<string, unknown>>() => Promise<T | null>
}

export interface D1DatabaseLike {
  prepare: (query: string) => D1Prepared
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
} as const

const DEFAULT_RATE_POLICIES = {
  auth: { enabled: 1, max_requests: 8, window_minutes: 15 },
  contato: { enabled: 1, max_requests: 5, window_minutes: 30 },
  enviar_email: { enabled: 1, max_requests: 3, window_minutes: 20 },
  analisar_ia: { enabled: 1, max_requests: 3, window_minutes: 15 },
  tesouro_ipca_vision: { enabled: 1, max_requests: 2, window_minutes: 15 },
  taxa_ipca_force_refresh: { enabled: 1, max_requests: 2, window_minutes: 30 },
} as const

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  })
}

export function isAllowedLcvOrigin(origin: string) {
  return /^https:\/\/([a-z0-9-]+\.)*lcv\.app\.br$/i.test(origin.trim())
}

export function requireAllowedOrigin(request: Request) {
  const origin = String(request.headers.get('Origin') ?? '').trim()
  if (!origin || !isAllowedLcvOrigin(origin)) {
    return jsonResponse({ ok: false, error: 'Origem não permitida.' }, 403)
  }
  return null
}

export function getClientIp(request: Request) {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim()
  if (cfIp) return cfIp

  const forwarded = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
  if (forwarded) return forwarded

  return 'unknown'
}

async function ensureRateLimitTables(db: D1DatabaseLike) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS oraculo_rate_limit_policies (
      route_key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      max_requests INTEGER NOT NULL,
      window_minutes INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS oraculo_api_rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_key TEXT NOT NULL,
      ip TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run()

  for (const [routeKey, defaults] of Object.entries(DEFAULT_RATE_POLICIES)) {
    await db.prepare(`
      INSERT OR IGNORE INTO oraculo_rate_limit_policies (route_key, enabled, max_requests, window_minutes, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(routeKey, defaults.enabled, defaults.max_requests, defaults.window_minutes, Date.now())
      .run()
  }
}

async function readRatePolicy(db: D1DatabaseLike, routeKey: keyof typeof DEFAULT_RATE_POLICIES) {
  await ensureRateLimitTables(db)
  const fallback = DEFAULT_RATE_POLICIES[routeKey]
  const row = await db.prepare(`
    SELECT enabled, max_requests, window_minutes
    FROM oraculo_rate_limit_policies
    WHERE route_key = ?
    LIMIT 1
  `)
    .bind(routeKey)
    .first<{ enabled?: number; max_requests?: number; window_minutes?: number }>()

  return {
    enabled: Number.parseInt(String(row?.enabled ?? fallback.enabled), 10) === 1,
    maxRequests: Math.max(1, Number.parseInt(String(row?.max_requests ?? fallback.max_requests), 10)),
    windowMinutes: Math.max(1, Number.parseInt(String(row?.window_minutes ?? fallback.window_minutes), 10)),
  }
}

export async function enforceRateLimit(
  request: Request,
  db: D1DatabaseLike,
  routeKey: keyof typeof DEFAULT_RATE_POLICIES,
) {
  const policy = await readRatePolicy(db, routeKey)
  if (!policy.enabled) return null

  const ip = getClientIp(request)
  const cutoff = Date.now() - (policy.windowMinutes * 60 * 1000)
  const row = await db.prepare(`
    SELECT COUNT(1) AS total
    FROM oraculo_api_rate_limits
    WHERE route_key = ? AND ip = ? AND created_at >= ?
  `)
    .bind(routeKey, ip, cutoff)
    .first<{ total?: number }>()

  const total = Number.parseInt(String(row?.total ?? 0), 10) || 0
  if (total >= policy.maxRequests) {
    return jsonResponse(
      { ok: false, error: 'Muitas tentativas em pouco tempo. Tente novamente mais tarde.' },
      429,
      { 'Retry-After': String(policy.windowMinutes * 60) },
    )
  }

  await db.prepare(`
    INSERT INTO oraculo_api_rate_limits (route_key, ip, created_at)
    VALUES (?, ?, ?)
  `)
    .bind(routeKey, ip, Date.now())
    .run()

  return null
}

export async function hashToken(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((chunk) => chunk.toString(16).padStart(2, '0'))
    .join('')
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeRichEmailHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .slice(0, 120000)
}
