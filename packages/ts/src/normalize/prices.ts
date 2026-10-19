import type { CardmarketPrice, TcgPrice } from '../types.js'
import { num, rec, str } from './common.js'

/** `variant` is the finish when the API names one (`sub_type_name` / `variant_type` / `variant`). */
export function tcgPrice(v: unknown, variant?: unknown): TcgPrice {
  const r = rec(v)
  return {
    variant: str(variant ?? r.sub_type_name ?? r.variant),
    low: num(r.low_price),
    mid: num(r.mid_price),
    high: num(r.high_price),
    market: num(r.market_price),
    directLow: num(r.direct_low_price),
    updatedAt: str(r.updated_at),
    raw: v,
  }
}

export function cardmarketPrice(v: unknown, variant?: unknown): CardmarketPrice {
  const r = rec(v)
  return {
    variant: str(variant ?? r.variant_type ?? r.variant),
    avg: num(r.avg),
    low: num(r.low),
    trend: num(r.trend),
    avg1: num(r.avg1),
    avg7: num(r.avg7),
    avg30: num(r.avg30),
    updatedAt: str(r.updated_at),
    raw: v,
  }
}
