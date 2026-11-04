import type { McpServer } from '@modelcontextprotocol/server'
import type { PokeWallet } from '@pokewallet/sdk'

export interface Deps {
  server: McpServer
  pw: PokeWallet
}

/** Every tool only reads, and always talks to the live API. */
export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const

export const COST = 'Costs one request of your own PokeWallet quota (free plan: 100 requests per hour), so prefer one precise call over many.'
/** Shared by search_cards, get_card and get_set. */
export const LANG_NOTE =
  'Pokémon only: also returns names, rarity, attacks and text in another language (de, es, fr, it, pt, ko, zh-cn, zh-tw, th, id; en and ja are the default). Translations can be partial (some fields stay in English), and a card without one is returned in English: check "language" in the result. Each Pokémon card lists the languages it has in "languages", and "imagePath" is the image path for the language asked.'

export const PRO_NEEDED = 'Needs a Pro plan or the 7-day trial for pokemon/onepiece, and an Ultra plan or trial for the ten other games; otherwise the API explains how to activate the trial.'
