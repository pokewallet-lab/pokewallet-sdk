import { AmbiguousSetError } from '@pokewallet/sdk'
import { z } from 'zod'
import { ambiguousResult, guarded, ok } from '../errors.js'
import { cardSummary, completion, setEntry, statistics } from '../shape.js'
import { gameParam, worldFor } from '../worlds.js'
import { COST, PRO_NEEDED, READ_ONLY, type Deps } from './common.js'

const setParam = z.string().min(1).describe('Set code (e.g. "PLF", "OP01", "FRA") or numeric setId. If a code is ambiguous the alternatives are returned: call again with one setId.')

export function registerSetTools({ server, pw }: Deps): void {
  server.registerTool(
    'list_sets',
    {
      title: 'List sets',
      description: `List the sets of a game, filtered here by name and/or language (the API returns the whole list, which can be hundreds of sets). Use name to find a set code or setId. ${COST}`,
      inputSchema: z.object({
        game: gameParam,
        name: z.string().optional().describe('Case-insensitive text to match in the set name or code.'),
        language: z.string().optional().describe('Pokémon: eng, jap, chn. One Piece: en, jp. Games: eng, jap.'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      annotations: READ_ONLY,
    },
    ({ game, name, language, limit }) =>
      guarded(async () => {
        const all = await worldFor(pw, game).sets({ language })
        const needle = name?.trim().toLowerCase()
        const hits = needle ? all.filter((s) => s.name.toLowerCase().includes(needle) || (s.code ?? '').toLowerCase() === needle) : all
        // Newest first: callers asking for the latest sets want them at the top.
        const sorted = [...hits].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
        return ok({ game, matching: hits.length, shown: Math.min(limit, hits.length), sets: sorted.slice(0, limit).map(setEntry) })
      }),
  )

  server.registerTool(
    'get_set',
    {
      title: 'Get the cards of a set',
      description: `One page of a set's cards (name, number, rarity, id). An ambiguous set code returns the candidate sets instead of an error. Prices are not in the listing: use search_cards or get_card. ${COST}`,
      inputSchema: z.object({
        set: setParam,
        game: gameParam,
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20).describe('Cards per page (max 50).'),
      }),
      annotations: READ_ONLY,
    },
    ({ set, game, page, limit }) =>
      guarded(async () => {
        try {
          const res = await worldFor(pw, game).set(set, { page, limit })
          return ok({
            game,
            set: setEntry(res.set),
            page: res.page,
            totalCards: res.total,
            totalPages: res.totalPages,
            cards: res.items.map((c) => {
              const { prices: _p, tcgplayerUsd: _t, cardmarketEur: _c, ...rest } = cardSummary(c) as Record<string, unknown>
              return rest
            }),
          })
        } catch (e) {
          if (e instanceof AmbiguousSetError) return ambiguousResult(e)
          throw e
        }
      }),
  )

  server.registerTool(
    'set_statistics',
    {
      title: 'Set price statistics',
      description: `Price statistics of a set: average, min, max, most expensive card and rarity breakdown, TCGPlayer USD and CardMarket EUR. ${PRO_NEEDED} ${COST}`,
      inputSchema: z.object({ set: setParam, game: gameParam, variant: z.enum(['normal', 'foil', 'holo']).optional().describe('Restrict to one finish (pokemon: normal|holo; others: normal|foil).') }),
      annotations: READ_ONLY,
    },
    ({ set, game, variant }) =>
      guarded(async () => {
        try {
          return ok(statistics(await worldFor(pw, game).statistics(set, { variant })))
        } catch (e) {
          if (e instanceof AmbiguousSetError) return ambiguousResult(e)
          throw e
        }
      }),
  )

  server.registerTool(
    'set_completion_value',
    {
      title: 'Cost to complete a set',
      description: `Estimated cost of one copy of every card in a set, with a breakdown by rarity. ${PRO_NEEDED} ${COST}`,
      inputSchema: z.object({ set: setParam, game: gameParam }),
      annotations: READ_ONLY,
    },
    ({ set, game }) =>
      guarded(async () => {
        try {
          return ok(completion(await worldFor(pw, game).completionValue(set)))
        } catch (e) {
          if (e instanceof AmbiguousSetError) return ambiguousResult(e)
          throw e
        }
      }),
  )
}
