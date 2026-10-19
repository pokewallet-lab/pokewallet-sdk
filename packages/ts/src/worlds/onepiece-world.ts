import { ValidationError } from '../errors.js'
import type { HttpClient } from '../http.js'
import { arr, num, rec } from '../normalize/common.js'
import { normalizeOpCard } from '../normalize/card.js'
import {
  normalizeCompletionValue,
  normalizeSetPrices,
  normalizeStatistics,
  normalizeTopCards,
  normalizeTrending,
} from '../normalize/pro.js'
import { normalizeSet } from '../normalize/sets.js'
import { makePage, paginate } from '../pagination.js'
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
import { checkLimit, checkPage, checkPeriod, checkText, checkVariant, seg } from '../validation.js'
import { LIMITS, type World } from './world.js'

const NUMERIC_ID = /^-?\d+$/

/**
 * One Piece lives under `/op` with its own shapes: flat cards, flat pagination
 * (`{data,total,page,limit}`), `group_id` instead of `set_id`, and set prices selected
 * through the query string. This class hides all of it behind the shared interface.
 */
export class OnePieceWorld implements World {
  constructor(private readonly http: HttpClient) {}

  async search(q: string, options: SearchOptions = {}): Promise<SearchPage> {
    const body = rec(
      await this.http.get('/op/search', {
        q: checkText('q', q),
        page: checkPage(options.page),
        limit: checkLimit(options.limit, LIMITS.search),
      }),
    )
    const items = arr(body.data).map((c) => normalizeOpCard(c))
    const page = makePage(items, { page: num(body.page) ?? 1, limit: num(body.limit) ?? items.length, total: num(body.total) ?? items.length })
    return { ...page, truncated: false }
  }

  searchAll(q: string, options: { limit?: number; maxItems?: number } = {}): AsyncGenerator<Card, void, undefined> {
    return paginate((page) => this.search(q, { page, limit: options.limit }), { maxItems: options.maxItems })
  }

  async card(id: string): Promise<Card> {
    return normalizeOpCard(await this.http.get(`/op/cards/${seg(id)}`))
  }

  async sets(options: { language?: string } = {}): Promise<SetSummary[]> {
    const body = rec(await this.http.get('/op/sets', { language: options.language }))
    return arr(body.data).map(normalizeSet)
  }

  /** `options.language` is ignored: One Piece maps a code to its first matching set. */
  async set(code: string, options: SetOptions = {}): Promise<SetPage> {
    const body = rec(
      await this.http.get(`/op/sets/${seg(code)}`, {
        page: checkPage(options.page),
        limit: checkLimit(options.limit, LIMITS.set),
      }),
    )
    const set = normalizeSet(body.set)
    const ctx = { setId: set.id || null, setCode: set.code }
    const items = arr(body.data).map((c) => normalizeOpCard(c, ctx))
    const page = makePage(items, { page: num(body.page) ?? 1, limit: num(body.limit) ?? items.length, total: num(body.total) ?? items.length })
    return { ...page, set }
  }

  setCards(code: string, options: { limit?: number; language?: string; maxItems?: number } = {}): AsyncGenerator<Card, void, undefined> {
    return paginate((page) => this.set(code, { page, limit: options.limit }), { maxItems: options.maxItems })
  }

  /** The set goes in the query here (`group_id` for numeric ids, `set_code` otherwise). */
  async prices(code: string, options: PricesOptions = {}): Promise<SetPrices> {
    if (options.source !== undefined) throw new ValidationError('source is not supported for One Piece prices')
    const c = checkText('code', code)
    const query = NUMERIC_ID.test(c) ? { group_id: c } : { set_code: c }
    return normalizeSetPrices(await this.http.get('/op/prices', query))
  }

  async statistics(code: string, options: StatisticsOptions = {}): Promise<SetStatistics> {
    return normalizeStatistics(await this.http.get(`/op/sets/${seg(code)}/statistics`, { variant: checkVariant(options.variant) }))
  }

  async completionValue(code: string): Promise<CompletionValue> {
    return normalizeCompletionValue(await this.http.get(`/op/sets/${seg(code)}/completion-value`))
  }

  async trending(options: TrendingOptions = {}): Promise<TrendingSet[]> {
    const period = checkPeriod(options.period)
    return normalizeTrending(await this.http.get('/op/sets/trending', { period, limit: checkLimit(options.limit, LIMITS.trending) }))
  }

  async topCards(options: TopCardsOptions = {}): Promise<TopCard[]> {
    return normalizeTopCards(
      await this.http.get('/op/analytics/top-cards', {
        metric: options.metric,
        source: options.source,
        limit: checkLimit(options.limit, LIMITS.topCards),
      }),
    )
  }
}
