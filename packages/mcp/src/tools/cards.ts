import { z } from 'zod'
import { guarded, ok } from '../errors.js'
import { cardDetail, cardSummary } from '../shape.js'
import { gameParam, worldFor } from '../worlds.js'
import { COST, READ_ONLY, type Deps } from './common.js'

export function registerCardTools({ server, pw }: Deps): void {
  server.registerTool(
    'list_games',
    {
      title: 'List supported games',
      description: `List the card games this server can query (pokemon, onepiece and ten more) with their codes for the "game" parameter. ${COST}`,
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    () =>
      guarded(async () => {
        const games = [
          { game: 'pokemon', name: 'Pokémon TCG' },
          { game: 'onepiece', name: 'One Piece Card Game' },
          ...(await pw.listGames()).map((g) => ({ game: g.code, name: g.name })),
        ]
        return ok({ games })
      }),
  )

  server.registerTool(
    'search_cards',
    {
      title: 'Search cards',
      description: `Search cards by name, card number or set. Each result already carries its id and market prices (TCGPlayer USD, CardMarket trend EUR, per finish), so a follow-up get_card is rarely needed. Returns at most 10 results per page. ${COST}`,
      inputSchema: z.object({
        query: z.string().min(2).max(100).describe('Card name, number or set, e.g. "charizard" or "OP01-001".'),
        game: gameParam,
        limit: z.number().int().min(1).max(10).default(5).describe('Results per page (max 10).'),
        page: z.number().int().min(1).default(1),
      }),
      annotations: READ_ONLY,
    },
    ({ query, game, limit, page }) =>
      guarded(async () => {
        const res = await worldFor(pw, game).search(query, { limit, page })
        return ok({
          game,
          query,
          page: res.page,
          totalResults: res.total,
          totalPages: res.totalPages,
          ...(res.truncated ? { note: 'The search hit its cap: use a more specific query instead of paging.' } : {}),
          results: res.items.map(cardSummary),
        })
      }),
  )

  server.registerTool(
    'get_card',
    {
      title: 'Get card details',
      description: `Full details of one card: text, type, game-specific stats, prices per finish and shop links. Use an id from search_cards or get_set. For pokemon, a plain card number plus setCode also works. ${COST}`,
      inputSchema: z.object({
        id: z.string().min(1).describe('Card id as returned by search_cards (pk_…, op_…, mtg_…, or a 64-character hex id), or a plain card number for pokemon.'),
        game: gameParam,
        setCode: z.string().optional().describe('Pokémon only: set code, required when id is a plain card number like "086/078".'),
      }),
      annotations: READ_ONLY,
    },
    ({ id, game, setCode }) =>
      guarded(async () => {
        const card = game === 'pokemon' ? await pw.pokemon.card(id, { setCode }) : await worldFor(pw, game).card(id)
        return ok(cardDetail(card))
      }),
  )
}
