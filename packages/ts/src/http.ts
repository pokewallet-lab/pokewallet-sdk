import { ValidationError, NetworkError, RateLimitError, type PokeWalletError } from './errors.js'
import { errorFromResponse } from './error-map.js'
import { DEFAULT_BASE_URL, DEFAULT_USER_AGENT } from './version.js'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ClientOptions {
  /**
   * API key (`pk_…`). Falls back to the `POKEWALLET_API_KEY` environment variable. Optional at
   * construction: only `health()` and `listGames()` work without one, every other call throws
   * `ValidationError` before touching the network.
   */
  apiKey?: string
  baseUrl?: string
  /** Sent on every request. Some network layers reject the default user agents of HTTP libraries. */
  userAgent?: string
  /** Custom `fetch`, mainly for tests. Defaults to the global one. */
  fetch?: FetchLike
  /** Retries after a 429 (with `Retry-After`) or a 503. Default 2. */
  maxRetries?: number
  /** Longest `Retry-After` the SDK will sit through, in seconds. Default 30. */
  retryAfterCapSeconds?: number
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number
  /** Replaces the delay between retries, mainly for tests. */
  sleep?: (ms: number) => Promise<void>
}

/** Quota counters from the `X-RateLimit-*` headers of the last answer. */
export interface RateLimitInfo {
  limitHour: number | null
  remainingHour: number | null
  limitDay: number | null
  remainingDay: number | null
}

export type Query = Record<string, string | number | boolean | undefined | null>

const GAME_PREFIX = /^\/(mtg|ygo|cfv|dbs|fab|dgm|swu|lor|rft|cpk)\//

export const KEY_REQUIRED = 'An API key is required: pass apiKey or set POKEWALLET_API_KEY'

/** The key from the options or the environment; undefined when there is none (public endpoints still work). */
function readKey(options: ClientOptions): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const key = (options.apiKey ?? env?.POKEWALLET_API_KEY ?? '').trim()
  if (!key) return undefined
  if (!key.startsWith('pk_')) throw new ValidationError('API keys start with "pk_"')
  return key
}

/** Seconds from a `Retry-After` value (delta-seconds or HTTP date), or undefined. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const n = Number(value)
  if (Number.isFinite(n) && n >= 0) return n
  const t = Date.parse(value)
  return Number.isNaN(t) ? undefined : Math.max(0, Math.ceil((t - now) / 1000))
}

function num(h: Headers, name: string): number | null {
  const v = h.get(name)
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function exhausted(err: RateLimitError): boolean {
  return [err.limits.hourly, err.limits.daily].some((w) => w !== undefined && w.remaining <= 0)
}

export class HttpClient {
  /** Quota counters of the most recent answer that carried them. */
  lastRateLimit: RateLimitInfo | null = null

  readonly #key: string | undefined
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly fetchImpl: FetchLike
  private readonly maxRetries: number
  private readonly capSeconds: number
  private readonly timeoutMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: ClientOptions = {}) {
    this.#key = readKey(options)
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    const g = globalThis as { fetch?: FetchLike }
    const f = options.fetch ?? (g.fetch ? g.fetch.bind(globalThis) : undefined)
    if (!f) throw new ValidationError('No fetch available: pass options.fetch (Node 18+ has one built in)')
    this.fetchImpl = f
    this.maxRetries = options.maxRetries ?? 2
    this.capSeconds = options.retryAfterCapSeconds ?? 30
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  url(path: string, query?: Query): string {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v))
    const s = qs.toString()
    return `${this.baseUrl}${path}${s ? `?${s}` : ''}`
  }

  /**
   * GET `path` and return the parsed JSON body; throws a typed error otherwise. `isPublic`
   * marks the two endpoints the server answers without a key; everything else needs one.
   * `accept` lets a caller treat a non-2xx body as data (see `health()`).
   */
  async get<T>(
    path: string,
    query?: Query,
    options: { isPublic?: boolean; accept?: (body: unknown) => boolean } = {},
  ): Promise<T> {
    if (this.#key === undefined && !options.isPublic) throw new ValidationError(KEY_REQUIRED)
    const url = this.url(path, query)
    for (let attempt = 0; ; attempt++) {
      const res = await this.send(url)
      const body = parseJson(this.#redact(await res.text()))
      this.trackQuota(res.headers)
      if (res.status >= 200 && res.status < 300) return body as T
      // Some non-2xx answers are data, not failures (an "unhealthy" report): return them as is, no retry.
      if (options.accept?.(body)) return body as T

      const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
      const err = errorFromResponse({ status: res.status, body, retryAfter, gameRoute: GAME_PREFIX.test(path) })
      if (attempt < this.maxRetries && this.shouldRetry(err, retryAfter)) {
        await this.sleep((retryAfter ?? 1) * 1000)
        continue
      }
      throw err
    }
  }

  private shouldRetry(err: PokeWalletError, retryAfter: number | undefined): boolean {
    if (err.status === 429) {
      // Never guess a wait: no header, or an exhausted window, means retrying is pointless.
      return retryAfter !== undefined && retryAfter <= this.capSeconds && !exhausted(err as RateLimitError)
    }
    if (err.status === 503) return (retryAfter ?? 1) <= this.capSeconds
    return false
  }

  private async send(url: string): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          ...(this.#key === undefined ? {} : { 'X-API-Key': this.#key }),
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (cause) {
      throw new NetworkError('Request failed before an answer arrived', { cause: this.#scrubError(cause) })
    }
  }

  /** Masked form: the only representation of this object that logging or serializing can reach. */
  toJSON(): { baseUrl: string; userAgent: string; apiKey: string | null } {
    return { baseUrl: this.baseUrl, userAgent: this.userAgent, apiKey: this.#key === undefined ? null : 'pk_***' }
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `HttpClient ${JSON.stringify(this.toJSON())}`
  }

  #redact(text: string): string {
    return this.#key === undefined ? text : text.split(this.#key).join('pk_***')
  }

  /** A copy of a thrown value with the key removed from its message, stack and string fields. */
  #scrubError(cause: unknown): unknown {
    if (!(cause instanceof Error)) return typeof cause === 'string' ? this.#redact(cause) : undefined
    const copy = new Error(this.#redact(cause.message))
    copy.name = cause.name
    if (cause.stack) copy.stack = this.#redact(cause.stack)
    const code = (cause as { code?: unknown }).code
    if (typeof code === 'string') (copy as { code?: string }).code = code
    return copy
  }

  private trackQuota(h: Headers): void {
    const info: RateLimitInfo = {
      limitHour: num(h, 'x-ratelimit-limit-hour'),
      remainingHour: num(h, 'x-ratelimit-remaining-hour'),
      limitDay: num(h, 'x-ratelimit-limit-day'),
      remainingDay: num(h, 'x-ratelimit-remaining-day'),
    }
    if (Object.values(info).some((v) => v !== null)) this.lastRateLimit = info
  }
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 200) }
  }
}
