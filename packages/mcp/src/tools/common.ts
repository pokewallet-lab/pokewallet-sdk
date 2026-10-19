import type { McpServer } from '@modelcontextprotocol/server'
import type { PokeWallet } from '@pokewallet/sdk'

export interface Deps {
  server: McpServer
  pw: PokeWallet
}

/** Every tool only reads, and always talks to the live API. */
export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const

export const COST = 'Costs one request of your own PokeWallet quota (free plan: 100 requests per hour), so prefer one precise call over many.'
export const PRO_NEEDED = 'Needs a Pro plan or the 7-day trial for pokemon/onepiece, and an Ultra plan or trial for the ten other games; otherwise the API explains how to activate the trial.'
