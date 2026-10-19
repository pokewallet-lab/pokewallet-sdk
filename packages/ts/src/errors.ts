/** Hourly or daily quota window as reported in a 429 body. */
export interface LimitWindow {
  limit: number
  used: number
  remaining: number
}

export interface RateLimitWindows {
  hourly?: LimitWindow
  daily?: LimitWindow
}

/** One candidate of an ambiguous set. `setId` is the value to pass back to pick it. */
export interface SetMatch {
  setId: string
  setCode: string | null
  name: string | null
  language: string | null
  releaseDate: string | null
}

export interface ErrorInit {
  status: number
  body?: unknown
  message?: string
}

/** Base class of every error raised by the SDK for an API answer. */
export class PokeWalletError extends Error {
  readonly status: number
  /** Parsed JSON body of the answer, when there was one. */
  readonly body: unknown
  /** The `error` field of the body, when present. */
  readonly code: string | undefined

  constructor(init: ErrorInit) {
    const code = bodyString(init.body, 'error')
    super(init.message ?? bodyString(init.body, 'message') ?? code ?? `HTTP ${init.status}`)
    this.name = new.target.name
    this.status = init.status
    this.body = init.body
    this.code = code
  }
}

/** Raised before any request when an argument is out of range. */
export class ValidationError extends RangeError {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** The request never produced an HTTP answer (DNS, connection, timeout). */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NetworkError'
  }
}

/** 400: missing or invalid parameter, or an id that cannot be decoded. */
export class BadRequestError extends PokeWalletError {}

/** 401: key missing, malformed or unknown. */
export class AuthError extends PokeWalletError {}

/**
 * 403 on a plan-gated endpoint. `redeemUrl` is set when the free trial was never
 * activated; `upgradeUrl` when the trial expired or the plan is too low.
 */
export class PlanRequiredError extends PokeWalletError {
  readonly redeemUrl: string | undefined
  readonly upgradeUrl: string | undefined

  constructor(init: ErrorInit) {
    super(init)
    this.redeemUrl = bodyString(init.body, 'redeem_url')
    this.upgradeUrl = bodyString(init.body, 'upgrade_url')
  }
}

/** 403 `Feature not enabled`: this account does not have access to this feature. */
export class FeatureNotEnabledError extends PokeWalletError {
  readonly contactUrl: string | undefined

  constructor(init: ErrorInit) {
    super(init)
    this.contactUrl = bodyString(init.body, 'contact_url')
  }
}

/** 404: unknown card, set or route. Carries the server's suggestions when it sent any. */
export class NotFoundError extends PokeWalletError {
  readonly didYouMean: string | undefined
  readonly suggestions: unknown[]

  constructor(init: ErrorInit) {
    super(init)
    this.didYouMean = bodyString(init.body, 'did_you_mean')
    const s = (init.body as { suggestions?: unknown } | null | undefined)?.suggestions
    this.suggestions = Array.isArray(s) ? s : []
  }
}

/** 404 on a game route: the game is switched off for this account. */
export class GameUnavailableError extends NotFoundError {}

/**
 * The set code matches several sets. Unifies the three ways the API says so
 * (200 with `disambiguation`, 300, 409). Retry with one `matches[i].setId`.
 */
export class AmbiguousSetError extends PokeWalletError {
  readonly matches: SetMatch[]

  constructor(init: ErrorInit & { matches: SetMatch[] }) {
    super({ ...init, message: init.message ?? 'Several sets match this code: pick one by setId' })
    this.matches = init.matches
  }
}

/**
 * 429. The API sends no `Retry-After`, so the SDK retries only when the header is
 * present and within the cap. `limits` mirrors the body: when a window shows
 * `remaining === 0`, waiting seconds cannot help.
 */
export class RateLimitError extends PokeWalletError {
  readonly limits: RateLimitWindows
  /** Seconds, from the `Retry-After` header, when present. */
  readonly retryAfter: number | undefined

  constructor(init: ErrorInit & { retryAfter?: number }) {
    super(init)
    this.retryAfter = init.retryAfter
    const l = (init.body as { limits?: Record<string, unknown> } | null | undefined)?.limits
    this.limits = { hourly: toWindow(l?.hourly), daily: toWindow(l?.daily) }
  }
}

/** 503: database busy or feature not yet enabled. `retryAfter` is 5 or 3600 seconds. */
export class UnavailableError extends PokeWalletError {
  readonly retryAfter: number | undefined

  constructor(init: ErrorInit & { retryAfter?: number }) {
    super(init)
    this.retryAfter = init.retryAfter
  }
}

/** Any other 5xx. Never retried. */
export class ServerError extends PokeWalletError {}

function bodyString(body: unknown, key: string): string | undefined {
  const v = (body as Record<string, unknown> | null | undefined)?.[key]
  return typeof v === 'string' ? v : undefined
}

function toWindow(v: unknown): LimitWindow | undefined {
  if (!v || typeof v !== 'object') return undefined
  const w = v as Record<string, unknown>
  if (typeof w.limit !== 'number' || typeof w.used !== 'number' || typeof w.remaining !== 'number') return undefined
  return { limit: w.limit, used: w.used, remaining: w.remaining }
}
