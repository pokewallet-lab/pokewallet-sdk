/**
 * Pulls the caller's PokeWallet key out of `Authorization: Bearer pk_…`.
 * Returns null for anything else, so the Worker can answer 401 before any upstream call.
 */
export function bearerKey(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(pk_[^\s]+)$/i.exec(header.trim())
  return m ? m[1]! : null
}

export function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      error: 'unauthorized',
      message: 'Send your PokeWallet API key as "Authorization: Bearer pk_…". Keys start with pk_.',
    }),
    {
      status: 401,
      headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer realm="pokewallet"' },
    },
  )
}

/**
 * The calling MCP client (Claude, Cursor, ...), taken from the first product token of its
 * `User-Agent`. Stateless requests carry no `initialize` payload, so the header is all there is.
 * Anything outside a plain token alphabet is dropped, and the result is capped.
 */
export function clientName(userAgent: string | null | undefined): string | null {
  const token = userAgent?.trim().split(/\s+/)[0]?.split('/')[0] ?? ''
  const clean = token.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40)
  return clean || null
}
