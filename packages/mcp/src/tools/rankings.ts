import { z } from 'zod'
import { guarded, ok } from '../errors.js'
import { history, topCard, trendingEntry } from '../shape.js'
import { gameParam, worldFor } from '../worlds.js'
import { COST, PRO_NEEDED, READ_ONLY, type Deps } from './common.js'

export function registerRankingTools({ server, pw }: Deps): void {
  server.registerTool(
    'get_price_history',
    {
      title: 'Price history of a Pokémon card',
      description: `Price snapshots of one Pokémon card (7, 14, 30, 60 and 120 days ago, per finish) with percentage changes. Pokémon only; other games have no history. ${PRO_NEEDED} ${COST}`,
      inputSchema: z.object({ id: z.string().min(1).describe('Pokémon card id (pk_…) from search_cards.') }),
      annotations: READ_ONLY,
    },
    ({ id }) => guarded(async () => ok(history(await pw.pokemon.priceHistory(id)))),
  )

  server.registerTool(
    'top_cards',
    {
      title: 'Most expensive or fastest-growing cards',
      description: `Ranking of cards by price or by 7-day growth, same format for every game. Price ranking uses the TCGPlayer market price (tcg, USD) or the CardMarket trend price (cm, EUR). Growth works with source "cm" in every game; source "tcg" growth exists for Pokémon only. Each card has its id (usable with get_card), set, number, rarity and current price; growth adds change7d. ${PRO_NEEDED} ${COST}`,
      inputSchema: z.object({
        game: gameParam,
        metric: z.enum(['price', 'growth']).default('price'),
        source: z.enum(['tcg', 'cm']).default('tcg').describe('tcg = TCGPlayer (USD), cm = CardMarket (EUR).'),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      annotations: READ_ONLY,
    },
    ({ game, metric, source, limit }) =>
      guarded(async () => {
        const cards = await worldFor(pw, game).topCards({ metric, source, limit })
        return ok({ game, metric, source, currency: source === 'tcg' ? 'USD' : 'EUR', cards: cards.map((c) => topCard(c, metric === 'growth')) })
      }),
  )

  server.registerTool(
    'trending_sets',
    {
      title: 'Trending sets',
      description: `Sets whose CardMarket prices moved the most over the last 7 days, with their top movers. Same for every game; only a 7-day period exists. ${PRO_NEEDED} ${COST}`,
      inputSchema: z.object({
        game: gameParam,
        limit: z.number().int().min(1).max(25).default(10),
      }),
      annotations: READ_ONLY,
    },
    ({ game, limit }) =>
      guarded(async () => {
        const sets = await worldFor(pw, game).trending({ limit })
        return ok({ game, period: '7d', sets: sets.map(trendingEntry) })
      }),
  )
}
