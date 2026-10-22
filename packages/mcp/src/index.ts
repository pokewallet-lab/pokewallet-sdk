import { createMcpHandler } from 'agents/mcp/server'
import { bearerKey, clientName, unauthorized } from './auth.js'
import { buildServer } from './server.js'
import { MCP_VERSION } from './version.js'

const ROUTE = '/mcp'

/**
 * Stateless remote MCP server (Streamable HTTP). The caller's key arrives as
 * `Authorization: Bearer pk_…` and is forwarded to the PokeWallet API through the SDK.
 * There is no server-side key, no storage, and the key is never logged or echoed.
 */
export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== ROUTE) {
      if (url.pathname === '/' && request.method === 'GET') {
        return Response.json({ name: 'pokewallet-mcp', version: MCP_VERSION, mcp: ROUTE, auth: 'Authorization: Bearer pk_…' })
      }
      return new Response('Not found', { status: 404 })
    }
    // Preflight carries no credentials; every other request must have a well-formed key
    // before anything else happens, so invalid keys never reach the upstream API.
    if (request.method !== 'OPTIONS' && !bearerKey(request.headers.get('authorization'))) return unauthorized()

    const handler = createMcpHandler(
      (context) => {
        const key = bearerKey(context.requestInfo?.headers.get('authorization'))
        if (!key) throw new Error('Missing API key')
        return buildServer(key, { clientName: clientName(context.requestInfo?.headers.get('user-agent')) })
      },
      { route: ROUTE },
    )
    return handler(request, env as never, ctx)
  },
} satisfies ExportedHandler
