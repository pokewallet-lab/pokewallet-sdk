import { ValidationError } from '../errors.js'
import { ambiguousSetError, isDisambiguation } from '../error-map.js'
import type { HttpClient } from '../http.js'
import { arr, num, rec } from '../normalize/common.js'
import { normalizeCard } from '../normalize/card.js'
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
import { checkLimit, checkPage, checkText, seg } from '../validation.js'
import { LIMITS, type World } from './world.js'

export interface CardWorldConfig {
  /** Route prefix: `''` for Pokémon, `/mtg` for a game. */
  prefix: string
  /** Pokémon accepts `period=30d` on trending; the other worlds only `7d`. */
  periods: readonly ('7d' | '30d')[]
  /** Minimum search length: the games reject queries shorter than 2 characters. */
  minQuery: number
}

/** Pokémon and the ten games share one response shape, so one class serves them all. */
export class CardWorld implements World {
  constructor(
    protected readonly http: HttpClient,
    protected readonly config: CardWorldConfig,
  ) {}

  protected path(rest: string): string {
    return `${this.config.prefix}${rest}`
  }

  async search(q: string, options: SearchOptions = {}): Promise<SearchPage> {
    const body = rec(
      await this.http.get(this.path('/search'), {
        q: checkText('q', q, this.config.minQuery),
        page: checkPage(options.page),
        limit: checkLimit(options.limit, LIMITS.search),
      }),
    )
    const p = rec(body.pagination)
    const items = arr(body.results).map((c) => normalizeCard(c))
    const page = makePage(items, { page: num(p.page) ?? 1, limit: num(p.limit) ?? items.length, total: num(p.total) ?? items.length })
    return { ...page, truncated: rec(body.metadata).truncated === true }
  }

  searchAll(q: string, options: { limit?: number; maxItems?: number } = {}): AsyncGenerator<Card, void, undefined> {
    return paginate((page) => this.search(q, { page, limit: options.limit }), { maxItems: options.maxItems })
  }

  async card(id: string): Promise<Card> {
    return normalizeCard(await this.http.get(this.path(`/cards/${seg(id)}`)))
  }

  async sets(options: { language?: string } = {}): Promise<SetSummary[]> {
    const body = rec(await this.http.get(this.path('/sets'), { language: options.language }))
    return arr(body.data).map(normalizeSet)
  }

  async set(code: string, options: SetOptions = {}): Promise<SetPage> {
    const body = rec(
      await this.http.get(this.path(`/sets/${seg(code)}`), {
        page: checkPage(options.page),
        limit: checkLimit(options.limit, LIMITS.set),
        language: options.language,
      }),
    )
    // 200 with a candidate list instead of cards: same condition as the 300/409 answers.
    if (isDisambiguation(body)) throw ambiguousSetError(200, body)
    const set = normalizeSet(body.set)
    // The Pokémon listing puts the numeric id in card_info.set_code: trust the set object instead.
    const ctx = { setId: set.id || null, setCode: set.code }
    const items = arr(body.cards).map((c) => normalizeCard(c, ctx))
    const p = rec(body.pagination)
    const page = makePage(items, { page: num(p.page) ?? 1, limit: num(p.limit) ?? items.length, total: num(p.total) ?? items.length })
    return { ...page, set }
  }

  setCards(code: string, options: { limit?: number; language?: string; maxItems?: number } = {}): AsyncGenerator<Card, void, undefined> {
    return paginate((page) => this.set(code, { page, limit: options.limit, language: options.language }), {
      maxItems: options.maxItems,
    })
  }

  async prices(code: string, options: PricesOptions = {}): Promise<SetPrices> {
    return normalizeSetPrices(await this.http.get(this.path(`/prices/${seg(code)}`), { source: options.source }))
  }

  async statistics(code: string, options: StatisticsOptions = {}): Promise<SetStatistics> {
    return normalizeStatistics(await this.http.get(this.path(`/sets/${seg(code)}/statistics`), { variant: options.variant }))
  }

  async completionValue(code: string): Promise<CompletionValue> {
    return normalizeCompletionValue(await this.http.get(this.path(`/sets/${seg(code)}/completion-value`)))
  }

  async trending(options: TrendingOptions = {}): Promise<TrendingSet[]> {
    const period = options.period ?? '7d'
    if (!this.config.periods.includes(period)) throw new ValidationError(`period ${period} is not available here (use ${this.config.periods.join(' or ')})`)
    return normalizeTrending(await this.http.get(this.path('/sets/trending'), { period, limit: checkLimit(options.limit, LIMITS.trending) }))
  }

  async topCards(options: TopCardsOptions = {}): Promise<TopCard[]> {
    return normalizeTopCards(
      await this.http.get(this.path('/analytics/top-cards'), {
        metric: options.metric,
        source: options.source,
        limit: checkLimit(options.limit, LIMITS.topCards),
      }),
    )
  }
}

