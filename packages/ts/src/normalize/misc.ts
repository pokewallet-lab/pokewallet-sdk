import { GAME_CODES, type Game, type GameCode, type Health, type HealthCheck } from '../types.js'
import { arr, num, rec, str } from './common.js'

function strings(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(rec(v))) if (typeof val === 'string') out[k] = val
  return out
}

/** `/games`: `{success, data: [{code, name, endpoints, pro_endpoints}]}` becomes a plain array. */
export function normalizeGames(raw: unknown): Game[] {
  return arr(rec(raw).data)
    .map((item): Game | null => {
      const g = rec(item)
      const code = str(g.code)
      if (code === null || !(GAME_CODES as readonly string[]).includes(code)) return null
      return { code: code as GameCode, name: str(g.name) ?? code, endpoints: strings(g.endpoints), proEndpoints: strings(g.pro_endpoints), raw: item }
    })
    .filter((g): g is Game => g !== null)
}

/** True when a body looks like a health report, whatever the HTTP status. */
export function isHealthReport(body: unknown): boolean {
  return typeof rec(body).status === 'string'
}

export function normalizeHealth(raw: unknown): Health {
  const r = rec(raw)
  const checks: Record<string, HealthCheck> = {}
  for (const [name, value] of Object.entries(rec(r.checks))) {
    const c = rec(value)
    checks[name] = { status: str(c.status) ?? 'unknown', message: str(c.message), responseTime: num(c.responseTime) }
  }
  return {
    status: str(r.status) ?? 'unknown',
    timestamp: str(r.timestamp),
    version: str(r.version),
    checks,
    responseTime: num(r.responseTime),
    region: str(r.region),
    message: str(r.message),
    raw,
  }
}
