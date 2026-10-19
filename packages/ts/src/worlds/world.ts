import type {
  Card,
  CompletionValue,
  PricesOptions,
  SearchOptions,
  SearchPage,
  SetOptions,
  SetPage,
  SetPrices,
  SetStatistics,
  SetSummary,
  StatisticsOptions,
  TopCard,
  TopCardsOptions,
  TrendingOptions,
  TrendingSet,
} from '../types.js'

/**
 * The one interface shared by Pokémon, One Piece and the ten games. Where the API
 * needs a different route, parameter or response shape, the world hides it.
 *
 * Plan-gated methods (`prices`, `statistics`, `completionValue`, `trending`, `topCards`)
 * throw `PlanRequiredError` when the account's plan or trial does not cover them.
 * An ambiguous set code throws `AmbiguousSetError`; retry with one of its `matches[].setId`.
 */
export interface World {
  /** One page of search results. `q` is 2-100 characters for the ten games. */
  search(q: string, options?: SearchOptions): Promise<SearchPage>
  /** Every result of a search, page after page. */
  searchAll(q: string, options?: { limit?: number; maxItems?: number }): AsyncGenerator<Card, void, undefined>
  /** Card by id (`pk_…`, `op_…`, `<code>_…`, or a 64-hex CardMarket id). */
  card(id: string): Promise<Card>
  /** All sets of the world. The API does not paginate this list. */
  sets(options?: { language?: string }): Promise<SetSummary[]>
  /** One page of a set's cards. `code` is a set code or a numeric set id. */
  set(code: string, options?: SetOptions): Promise<SetPage>
  /** Every card of a set, page after page. */
  setCards(code: string, options?: { limit?: number; language?: string; maxItems?: number }): AsyncGenerator<Card, void, undefined>
  /** Prices of every card in a set: hundreds to thousands of rows. */
  prices(code: string, options?: PricesOptions): Promise<SetPrices>
  statistics(code: string, options?: StatisticsOptions): Promise<SetStatistics>
  completionValue(code: string): Promise<CompletionValue>
  trending(options?: TrendingOptions): Promise<TrendingSet[]>
  topCards(options?: TopCardsOptions): Promise<TopCard[]>
}

export const LIMITS = { search: 100, set: 200, trending: 50, topCards: 100 } as const
