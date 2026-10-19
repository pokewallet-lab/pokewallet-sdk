import type {
  CompletionValue,
  HistoryPoint,
  PriceHistory,
  PriceRow,
  PriceStats,
  SetPrices,
  SetStatistics,
  TopCard,
  TrendingSet,
} from '../types.js'
import { arr, num, rec, setPair, setRef, str } from './common.js'
import { cardmarketPrice, tcgPrice } from './prices.js'

const DAYS = [7, 14, 30, 60, 120] as const

/** Set prices. Pokémon and One Piece name the set id `group_id`, the games `set_id`. */
export function normalizeSetPrices(raw: unknown): SetPrices {
  const r = rec(raw)
  const pair = setPair(r.set_code, r.set_id ?? r.group_id)
  const rows: PriceRow[] = arr(r.data).map((d) => {
    const row = rec(d)
    return {
      id: str(row.id) ?? '',
      number: str(row.card_number),
      name: str(row.name) ?? '',
      variant: str(row.variant),
      productType: str(row.product_type),
      tcgplayer: row.tcgplayer ? tcgPrice(row.tcgplayer, row.variant) : null,
      cardmarket: row.cardmarket ? cardmarketPrice(row.cardmarket, row.variant) : null,
    }
  })
  return { source: str(r.source) ?? 'both', setId: pair.id, setCode: pair.code, rows, total: num(r.total) ?? rows.length, raw }
}

function priceStats(v: unknown): PriceStats | null {
  if (!v || typeof v !== 'object') return null
  const s = rec(v)
  const top = s.most_expensive ? rec(s.most_expensive) : null
  return {
    avg: num(s.avg_market_price ?? s.avg_price),
    min: num(s.min_price),
    max: num(s.max_price),
    mostExpensive: top ? { id: str(top.id), name: str(top.name), price: num(top.price) } : null,
    trendDirection: str(s.trend_direction),
  }
}

export function normalizeStatistics(raw: unknown): SetStatistics {
  const r = rec(raw)
  const info = rec(r.set_info)
  const stats = rec(r.price_statistics)
  const rarity: Record<string, number> = {}
  for (const [k, v] of Object.entries(rec(r.rarity_breakdown))) rarity[k] = num(v) ?? 0
  return {
    set: { ...setRef(info.name, info.set_code, info.set_id), totalCards: num(info.total_cards) },
    tcgplayer: priceStats(stats.tcgplayer),
    cardmarket: priceStats(stats.cardmarket),
    rarityBreakdown: rarity,
    raw,
  }
}

export function normalizeCompletionValue(raw: unknown): CompletionValue {
  const r = rec(raw)
  const info = rec(r.set_info)
  const cost = rec(r.completion_cost)
  const t = cost.tcgplayer ? rec(cost.tcgplayer) : null
  const c = cost.cardmarket ? rec(cost.cardmarket) : null
  const byRarity: CompletionValue['byRarity'] = {}
  for (const [k, v] of Object.entries(rec(r.breakdown_by_rarity))) {
    byRarity[k] = { count: num(rec(v).count) ?? 0, totalCost: num(rec(v).total_cost) }
  }
  return {
    set: { ...setRef(info.name, info.set_code, info.set_id), totalCards: num(info.total_cards) },
    tcgplayer: t ? { currency: str(t.currency), low: num(t.low_estimate), market: num(t.market_estimate), high: num(t.high_estimate) } : null,
    cardmarket: c ? { currency: str(c.currency), low: num(c.low_estimate), avg: num(c.avg_estimate), trend: num(c.trend_estimate) } : null,
    byRarity,
    note: str(cost.note),
    raw,
  }
}

/** `+446.7%` -> 446.7. */
function pct(v: unknown): number | null {
  const s = str(v)
  return s === null ? null : num(s.replace('%', '').replace('+', ''))
}

export function normalizeTrending(raw: unknown): TrendingSet[] {
  return arr(rec(raw).trending_sets).map((item) => {
    const s = rec(item)
    const cm = rec(s.cardmarket)
    return {
      set: setRef(s.set_name, s.set_code, s.set_id),
      cardCount: num(s.card_count),
      change: str(cm.price_change),
      changePct: pct(cm.price_change),
      avgPriceCurrent: num(cm.avg_price_current),
      avgPricePrevious: num(cm.avg_price_previous),
      topMovers: arr(cm.top_movers).map((m) => ({ name: str(rec(m).name), change: str(rec(m).change) })),
      raw: item,
    }
  })
}

export function normalizeTopCards(raw: unknown): TopCard[] {
  return arr(rec(raw).top_cards).map((item) => {
    const c = rec(item)
    const info = rec(c.card_info)
    const pair = setPair(info.set_code, info.set_id)
    return {
      id: str(c.id) ?? '',
      name: str(info.name) ?? '',
      number: str(info.card_number),
      rarity: str(info.rarity),
      setName: str(info.set_name),
      setId: pair.id,
      setCode: pair.code,
      price: num(c.current_price),
      previousPrice7d: num(c.previous_price_7d),
      change7d: str(c.change_7d),
      raw: item,
    }
  })
}

function historySide(v: unknown): Record<string, HistoryPoint> | null {
  const variants = v && typeof v === 'object' ? rec(rec(v).variants) : null
  if (!variants) return null
  const out: Record<string, HistoryPoint> = {}
  for (const [name, data] of Object.entries(variants)) {
    const d = rec(data)
    const current: Record<string, number | null> = {}
    for (const [k, val] of Object.entries(rec(d.current))) current[k] = num(val)
    const price: Record<number, number | null> = {}
    const change: Record<number, string | null> = {}
    for (const day of DAYS) {
      price[day] = num(d[`price_${day}d`])
      change[day] = str(d[`change_${day}d`])
    }
    out[name] = { price, change, current, lastUpdated: str(d.last_updated) }
  }
  return out
}

export function normalizePriceHistory(raw: unknown): PriceHistory {
  const r = rec(raw)
  return { id: str(r.id) ?? '', name: str(r.card_name), tcgplayer: historySide(r.tcgplayer), cardmarket: historySide(r.cardmarket), raw }
}
