import {
  AmbiguousSetError,
  AuthError,
  BadRequestError,
  FeatureNotEnabledError,
  GameUnavailableError,
  NetworkError,
  NotFoundError,
  PlanRequiredError,
  PokeWalletError,
  RateLimitError,
  UnavailableError,
  ValidationError,
  type SetMatch,
} from '@pokewallet/sdk'

export interface ToolResult {
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export const ok = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data) }] })

const fail = (text: string): ToolResult => ({ isError: true, content: [{ type: 'text', text }] })

export function matchEntries(matches: SetMatch[]): Array<Record<string, unknown>> {
  return matches.slice(0, 25).map((m) => ({ setId: m.setId, code: m.setCode, name: m.name, language: m.language, released: m.releaseDate?.replace(/T.*$/, '') }))
}

/** An ambiguous set is not a failure: hand the alternatives back so the caller can pick one. */
export function ambiguousResult(e: AmbiguousSetError): ToolResult {
  return ok({
    ambiguous: true,
    message: 'Several sets share this code. Call again with the setId of one of them.',
    matches: matchEntries(e.matches),
  })
}

/**
 * Turns SDK errors into tool errors. Permission and plan errors keep the original message and
 * link so the user sees exactly what the API said.
 */
export function toolError(e: unknown): ToolResult {
  if (e instanceof PlanRequiredError) {
    const link = e.redeemUrl ?? e.upgradeUrl
    return fail(`${e.message}${link ? ` — ${link}` : ''} (plan or trial required for this data)`)
  }
  if (e instanceof FeatureNotEnabledError) return fail(`${e.message}${e.contactUrl ? ` — ${e.contactUrl}` : ''}`)
  if (e instanceof AuthError) return fail(`The PokeWallet API rejected the key: ${e.message}`)
  if (e instanceof RateLimitError) {
    const h = e.limits.hourly
    const d = e.limits.daily
    const left = [h && `hourly ${h.remaining}/${h.limit} left`, d && `daily ${d.remaining}/${d.limit} left`].filter(Boolean).join(', ')
    return fail(`Rate limit reached${left ? ` (${left})` : ''}. Each tool call costs one request; wait for the window to reset.`)
  }
  if (e instanceof UnavailableError) return fail(`${e.message}. Temporarily unavailable; try again in a few seconds.`)
  if (e instanceof GameUnavailableError) return fail('This game is not available for this account.')
  if (e instanceof NotFoundError) {
    const hint = [e.didYouMean && `Did you mean ${e.didYouMean}?`, e.suggestions.length ? `Suggestions: ${JSON.stringify(e.suggestions.slice(0, 5))}` : ''].filter(Boolean).join(' ')
    return fail(`${e.message}${hint ? ` ${hint}` : ''}`)
  }
  if (e instanceof AmbiguousSetError) return ambiguousResult(e)
  if (e instanceof BadRequestError || e instanceof ValidationError) return fail(e.message)
  if (e instanceof NetworkError) return fail('Could not reach the PokeWallet API.')
  if (e instanceof PokeWalletError) return fail(`PokeWallet API error (${e.status}): ${e.message}`)
  return fail('Unexpected error while calling the PokeWallet API.')
}

/** Runs a tool body and maps any thrown error to a tool result. */
export async function guarded(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn()
  } catch (e) {
    return toolError(e)
  }
}
