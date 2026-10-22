import { McpServer } from '@modelcontextprotocol/server'
import { PokeWallet } from '@pokewallet/sdk'
import { registerCardTools } from './tools/cards.js'
import { registerRankingTools } from './tools/rankings.js'
import { registerSetTools } from './tools/sets.js'
import { MCP_USER_AGENT, MCP_VERSION } from './version.js'

/** `pokewallet-mcp/<version>` plus the calling MCP client, when it identified itself. */
function clientLabel(name: string | null | undefined): string {
  return name ? `${MCP_USER_AGENT} (${name})` : MCP_USER_AGENT
}

/** One server per request, bound to the caller's own key. Nothing is shared between callers. */
export function buildServer(apiKey: string, options: { baseUrl?: string; fetch?: typeof fetch; clientName?: string | null } = {}): McpServer {
  const pw = new PokeWallet({ apiKey, userAgent: MCP_USER_AGENT, client: clientLabel(options.clientName), baseUrl: options.baseUrl, fetch: options.fetch })
  const server = new McpServer(
    { name: 'pokewallet', version: MCP_VERSION },
    {
      instructions:
        'Read-only access to card data and prices (Pokémon, One Piece and ten more games) through the caller\'s own PokeWallet key. Every tool call uses one request of that key\'s quota.',
    },
  )
  const deps = { server, pw }
  registerCardTools(deps)
  registerSetTools(deps)
  registerRankingTools(deps)
  return server
}
