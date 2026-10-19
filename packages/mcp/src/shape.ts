/**
 * Trims SDK objects into compact JSON: no nulls, no duplicated fields, no
 * server-internal ids. Only fields chosen here are emitted, never the raw payload.
 */
import type {
  Card,
  CompletionValue,
  PriceHistory,
  SetStatistics,
  SetSummary,
  TopCard,
  TrendingSet,
} from '@pokewallet/sdk'

/** Removes null, undefined, empty strings, empty arrays and empty objects, recursively. */
export function prune<T>(value: T): T | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (Array.isArray(value)) {
    const items = value.map((v) => prune(v)).filter((v) => v !== undefined)
    return (items.length ? items : undefined) as T | undefined
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = prune(v)
      if (p !== undefined) out[k] = p
    }
    return (Object.keys(out).length ? out : undefined) as T | undefined
  }
  return value
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function setLabel(c: { setName: string | null; setCode: string | null; setId: string | null }): string | undefined {
  if (!c.setName && !c.setCode) return undefined
  return c.setName ? (c.setCode ? `${c.setName} (${c.setCode})` : c.setName) : (c.setCode ?? undefined)
}

/** Market price per finish: TCGPlayer in USD, CardMarket trend in EUR. */
function priceMaps(c: Card): { tcgplayerUsd?: Record<string, number>; cardmarketEur?: Record<string, number> } {
  const tcg: Record<string, number> = {}
  for (const p of c.tcgplayer?.prices ?? []) if (p.market !== null) tcg[p.variant ?? 'default'] = p.market
  const cm: Record<string, number> = {}
  for (const p of c.cardmarket?.prices ?? []) if (p.trend !== null) cm[p.variant ?? 'default'] = p.trend
  return {
    ...(Object.keys(tcg).length ? { tcgplayerUsd: tcg } : {}),
    ...(Object.keys(cm).length ? { cardmarketEur: cm } : {}),
  }
}

/** Search hits and set listings: enough to pick a card and read its price, nothing else. */
export function cardSummary(c: Card): Record<string, unknown> {
  return prune({
    id: c.id,
    name: c.name,
    set: setLabel(c),
    setId: c.setCode ? undefined : (c.setId ?? undefined),
    number: c.number,
    rarity: c.rarity,
    ...priceMaps(c),
  }) as Record<string, unknown>
}

const SKIP_DETAILS = new Set(['upc', 'gtin', 'flavor_text', 'bandai_disclaimer', 'disclaimer', 'attacks'])

function details(info: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(info)) {
    if (SKIP_DETAILS.has(k)) continue
    if (typeof v === 'string') out[k] = clip(v, 200)
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  const attacks = info.attacks
  if (Array.isArray(attacks)) out.attacks = attacks.filter((a): a is string => typeof a === 'string').slice(0, 4).map((a) => clip(a.replace(/\s+/g, ' '), 240))
  return out
}

/** One card in full: summary plus text, type, game-specific fields and shop links. */
export function cardDetail(c: Card): Record<string, unknown> {
  return prune({
    ...cardSummary(c),
    type: c.cardType,
    productType: c.productType && c.productType !== 'card' ? c.productType : undefined,
    text: c.text ? clip(c.text, 600) : undefined,
    finishes: c.variants,
    details: details(c.info),
    links: { tcgplayer: c.tcgplayer?.url, cardmarket: c.cardmarket?.url },
  }) as Record<string, unknown>
}

export function setEntry(s: SetSummary): Record<string, unknown> {
  return prune({
    setId: s.id,
    code: s.code,
    name: s.name,
    language: s.language,
    released: s.releaseDate ? s.releaseDate.replace(/T.*$/, '') : undefined,
    cards: s.cardCount ?? undefined,
  }) as Record<string, unknown>
}

const setRef = (s: { id: string | null; code: string | null; name: string | null }) =>
  prune({ name: s.name, code: s.code, setId: s.id })

export function statistics(s: SetStatistics): Record<string, unknown> {
  const side = (p: SetStatistics['tcgplayer']) =>
    p && {
      average: p.avg,
      min: p.min,
      max: p.max,
      mostExpensive: p.mostExpensive && { name: p.mostExpensive.name, price: p.mostExpensive.price, id: p.mostExpensive.id },
      trend: p.trendDirection,
    }
  return prune({
    set: setRef(s.set),
    totalCards: s.set.totalCards,
    tcgplayerUsd: side(s.tcgplayer),
    cardmarketEur: side(s.cardmarket),
    rarityBreakdown: s.rarityBreakdown,
  }) as Record<string, unknown>
}

export function completion(c: CompletionValue): Record<string, unknown> {
  const byRarity: Record<string, { cards: number; cost: number | null }> = {}
  for (const [k, v] of Object.entries(c.byRarity)) byRarity[k] = { cards: v.count, cost: v.totalCost }
  return prune({
    set: setRef(c.set),
    totalCards: c.set.totalCards,
    tcgplayerUsd: c.tcgplayer && { low: c.tcgplayer.low, market: c.tcgplayer.market, high: c.tcgplayer.high },
    cardmarketEur: c.cardmarket && { low: c.cardmarket.low, average: c.cardmarket.avg, trend: c.cardmarket.trend },
    byRarity,
    note: c.note ? clip(c.note, 200) : undefined,
  }) as Record<string, unknown>
}

export function trendingEntry(t: TrendingSet): Record<string, unknown> {
  return prune({
    set: setRef(t.set),
    cards: t.cardCount,
    change: t.change,
    avgPriceEur: { now: t.avgPriceCurrent, before: t.avgPricePrevious },
    topMovers: t.topMovers.slice(0, 3),
  }) as Record<string, unknown>
}

export function topCard(t: TopCard, growth: boolean): Record<string, unknown> {
  return prune({
    id: t.id,
    name: t.name,
    set: setLabel({ setName: t.setName, setCode: t.setCode, setId: t.setId }),
    number: t.number,
    rarity: t.rarity,
    price: t.price,
    ...(growth ? { change7d: t.change7d, price7dAgo: t.previousPrice7d } : {}),
  }) as Record<string, unknown>
}

export function history(h: PriceHistory): Record<string, unknown> {
  const side = (s: PriceHistory['tcgplayer'], now: string) => {
    if (!s) return undefined
    const out: Record<string, unknown> = {}
    for (const [finish, p] of Object.entries(s)) {
      const price: Record<string, number | null> = {}
      const change: Record<string, string | null> = {}
      for (const d of [7, 14, 30, 60, 120]) {
        price[`${d}d`] = p.price[d] ?? null
        change[`${d}d`] = p.change[d] ?? null
      }
      out[finish] = { now: p.current[now] ?? null, priceDaysAgo: price, change }
    }
    return out
  }
  return prune({
    id: h.id,
    name: h.name,
    tcgplayerUsd: side(h.tcgplayer, 'market'),
    cardmarketEur: side(h.cardmarket, 'trend'),
  }) as Record<string, unknown>
}
