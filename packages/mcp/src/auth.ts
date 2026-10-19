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
