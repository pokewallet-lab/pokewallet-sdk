/**
 * Public, normalized types. Every object keeps the unmodified server value in `raw`.
 * Prices are `number | null`; the API sometimes sends numeric strings.
 */

export const GAME_CODES = ['mtg', 'ygo', 'cfv', 'dbs', 'fab', 'dgm', 'swu', 'lor', 'rft', 'cpk'] as const
export type GameCode = (typeof GAME_CODES)[number]

export interface TcgPrice {
  /** Finish (`Normal`, `Holofoil`, `Foil`...). Null for rows that have no finish. */
  variant: string | null
  low: number | null
  mid: number | null
  high: number | null
  market: number | null
  directLow: number | null
  updatedAt: string | null
  raw: unknown
}

export interface CardmarketPrice {
  variant: string | null
  avg: number | null
  low: number | null
  trend: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
  updatedAt: string | null
  raw: unknown
}

export interface Card {
  /** `pk_…` (Pokémon), `op_…`, `<code>_…`, or a 64-character hex CardMarket id. Reuse as is. */
  id: string
  name: string
  cleanName: string | null
  number: string | null
  rarity: string | null
  cardType: string | null
  productType: string | null
  text: string | null
  variants: string[]
  /**
   * Set identifiers. `setId` is the numeric id (possibly negative); `setCode` the short code.
   * Source: `card_info.set_id` / `card_info.set_code`, except for cards listed by a set, where both come
   * from the response's `set` object (the Pokémon listing puts the numeric id in `card_info.set_code`).
   * One Piece search and detail answers carry neither, so both are null there.
   */
  setId: string | null
  setCode: string | null
  setName: string | null
  tcgplayer: { url: string | null; prices: TcgPrice[] } | null
  cardmarket: { productName: string | null; url: string | null; prices: CardmarketPrice[] } | null
  /** Game-specific fields: `hp`, `attacks`, `p`, `t`, `ext_color`... as sent by the API. */
  info: Record<string, unknown>
  raw: unknown
}

export interface SetSummary {
  /** Numeric set id as a string (`set_id`; `group_id` for One Piece). */
  id: string
  code: string | null
  name: string
  /** Free text. Pokémon uses `eng`/`jap`/`chn`, One Piece `en`/`jp`. */
  language: string | null
  releaseDate: string | null
  cardCount: number | null
  sealedCount: number | null
  raw: unknown
}

export interface Page<T> {
  items: T[]
  page: number
  limit: number
  total: number
  /** Computed from `total` and `limit`, so it is always a finite number. */
  totalPages: number
}

export interface SearchPage extends Page<Card> {
  /** Games only: the search stopped at its cap, refine the query instead of paging. */
  truncated: boolean
}

export interface SetPage extends Page<Card> {
  set: SetSummary
}

export interface PriceRow {
  id: string
  number: string | null
  name: string
  variant: string | null
  productType: string | null
  tcgplayer: TcgPrice | null
  cardmarket: CardmarketPrice | null
}

export interface SetPrices {
  source: string
  setId: string | null
  setCode: string | null
  rows: PriceRow[]
  total: number
  raw: unknown
}

export interface SetRef {
  id: string | null
  code: string | null
  name: string | null
}

export interface PriceStats {
  avg: number | null
  min: number | null
  max: number | null
  mostExpensive: { id: string | null; name: string | null; price: number | null } | null
  trendDirection: string | null
}

export interface SetStatistics {
  set: SetRef & { totalCards: number | null }
  tcgplayer: PriceStats | null
  cardmarket: PriceStats | null
  rarityBreakdown: Record<string, number>
  raw: unknown
}

export interface CompletionValue {
  set: SetRef & { totalCards: number | null }
  tcgplayer: { currency: string | null; low: number | null; market: number | null; high: number | null } | null
  cardmarket: { currency: string | null; low: number | null; avg: number | null; trend: number | null } | null
  byRarity: Record<string, { count: number; totalCost: number | null }>
  note: string | null
  raw: unknown
}

export interface TrendingSet {
  set: SetRef
  cardCount: number | null
  /** As sent: `+446.7%`. */
  change: string | null
  changePct: number | null
  avgPriceCurrent: number | null
  avgPricePrevious: number | null
  topMovers: Array<{ name: string | null; change: string | null }>
  raw: unknown
}

export interface TopCard {
  id: string
  name: string
  number: string | null
  rarity: string | null
  setName: string | null
  setId: string | null
  setCode: string | null
  price: number | null
  previousPrice7d: number | null
  change7d: string | null
  raw: unknown
}

export interface HistoryPoint {
  /** Snapshot price keyed by days back: 7, 14, 30, 60, 120. */
  price: Record<number, number | null>
  change: Record<number, string | null>
  current: Record<string, number | null>
  lastUpdated: string | null
}

export interface PriceHistory {
  id: string
  name: string | null
  tcgplayer: Record<string, HistoryPoint> | null
  cardmarket: Record<string, HistoryPoint> | null
  raw: unknown
}

export type SearchOptions = { page?: number; limit?: number }
export type SetOptions = { page?: number; limit?: number; language?: string }
export type PricesOptions = { source?: 'tcg' | 'cm' }
export type StatisticsOptions = { variant?: string }
export type TrendingOptions = { period?: '7d' | '30d'; limit?: number }
export type TopCardsOptions = { metric?: 'price' | 'growth'; source?: 'tcg' | 'cm'; limit?: number }

export interface Game {
  /** Route prefix and `game` code: `mtg`, `ygo`, ... */
  code: GameCode
  name: string
  /** Free routes, keyed by role: `sets`, `set`, `card`, `search`, `image`. */
  endpoints: Record<string, string>
  /** Plan-gated routes: `prices`, `statistics`, `completion_value`, `trending`, `top_cards`. */
  proEndpoints: Record<string, string>
  raw: unknown
}

export interface HealthCheck {
  /** `healthy`, `degraded` or `unhealthy`. */
  status: string
  /** Set by the server when the check failed or is limited. */
  message: string | null
  responseTime: number | null
}

export interface Health {
  /** Overall status: `healthy` or `unhealthy`. Only the database and storage are critical. */
  status: string
  timestamp: string | null
  version: string | null
  /** Per-service checks: `database`, `cache`, `storage`. */
  checks: Record<string, HealthCheck>
  responseTime: number | null
  region: string | null
  message: string | null
  raw: unknown
}
