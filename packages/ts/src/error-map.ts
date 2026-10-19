import {
  AmbiguousSetError,
  AuthError,
  BadRequestError,
  FeatureNotEnabledError,
  GameUnavailableError,
  NotFoundError,
  PlanRequiredError,
  PokeWalletError,
  RateLimitError,
  ServerError,
  UnavailableError,
  type SetMatch,
} from './errors.js'

interface RawMatch {
  set_id?: unknown
  set_code?: unknown
  name?: unknown
  language?: unknown
  release_date?: unknown
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null)

/** Converts the `matches` array of any ambiguous-set body into the public shape. */
export function toSetMatches(body: unknown): SetMatch[] {
  const raw = (body as { matches?: unknown } | null | undefined)?.matches
  if (!Array.isArray(raw)) return []
  return raw.map((m: RawMatch) => ({
    setId: str(m.set_id) ?? '',
    setCode: str(m.set_code),
    name: str(m.name),
    language: str(m.language),
    releaseDate: str(m.release_date),
  }))
}

/** True for the 200 body the API uses to say "several sets match". */
export function isDisambiguation(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { disambiguation?: unknown }).disambiguation === true
}

export function ambiguousSetError(status: number, body: unknown): AmbiguousSetError {
  return new AmbiguousSetError({ status, body, matches: toSetMatches(body) })
}

export interface ErrorContext {
  status: number
  body: unknown
  retryAfter: number | undefined
  /** True when the request went to one of the ten `/{game}` prefixes. */
  gameRoute: boolean
}

/** Maps a non-success answer to its typed error. Pure: no retry decisions here. */
export function errorFromResponse(ctx: ErrorContext): PokeWalletError {
  const { status, body, retryAfter, gameRoute } = ctx
  const init = { status, body }
  const code = (body as { error?: unknown } | null | undefined)?.error

  if (status === 300 || (status === 409 && isDisambiguation(body)) || (status === 409 && code === 'Ambiguous set code')) {
    return ambiguousSetError(status, body)
  }
  switch (status) {
    case 400:
      return new BadRequestError(init)
    case 401:
      return new AuthError(init)
    case 403:
      return code === 'Feature not enabled' ? new FeatureNotEnabledError(init) : new PlanRequiredError(init)
    case 404:
      // A switched-off game answers with the generic route 404, not a resource 404.
      return gameRoute && code === 'Endpoint not found' ? new GameUnavailableError(init) : new NotFoundError(init)
    case 429:
      return new RateLimitError({ ...init, retryAfter })
    case 503:
      return new UnavailableError({ ...init, retryAfter })
    default:
      return status >= 500 ? new ServerError(init) : new PokeWalletError(init)
  }
}
