import type { Card } from '../types.js'
import { arr, rec, setPair, str, type Rec } from './common.js'
import { cardmarketPrice, tcgPrice } from './prices.js'

/** Where a card was listed, when the surrounding response knows better than `card_info`. */
export interface SetContext {
  setId: string | null
  setCode: string | null
}

const KNOWN = new Set([
  'name', 'clean_name', 'set_name', 'set_code', 'set_id', 'card_number', 'rarity', 'card_type',
  'product_type', 'variants', 'card_text',
])

/** Card in the Pokémon shape (Pokémon and the ten games): `{id, card_info, tcgplayer, cardmarket}`. */
export function normalizeCard(raw: unknown, ctx?: SetContext): Card {
  const r = rec(raw)
  const info = rec(r.card_info)
  const tcg = r.tcgplayer ? rec(r.tcgplayer) : null
  const cm = r.cardmarket ? rec(r.cardmarket) : null
  const pair = ctx ?? { setId: setPair(info.set_code, info.set_id).id, setCode: setPair(info.set_code, info.set_id).code }
  return {
    id: str(r.id) ?? '',
    name: str(info.name) ?? '',
    cleanName: str(info.clean_name),
    number: str(info.card_number),
    rarity: str(info.rarity),
    cardType: str(info.card_type),
    productType: str(info.product_type),
    text: str(info.card_text),
    variants: arr(info.variants).filter((v): v is string => typeof v === 'string'),
    setId: pair.setId,
    setCode: pair.setCode,
    setName: str(info.set_name),
    tcgplayer: tcg ? { url: str(tcg.url), prices: arr(tcg.prices).map((p) => tcgPrice(p)) } : null,
    cardmarket: cm
      ? { productName: str(cm.product_name), url: str(cm.product_url), prices: arr(cm.prices).map((p) => cardmarketPrice(p)) }
      : null,
    info: extras(info),
    raw,
  }
}

function extras(info: Rec): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(info)) if (!KNOWN.has(k)) out[k] = v
  return out
}

/** One Piece card: flat, `ext_*` fields, a single price object per source. */
export function normalizeOpCard(raw: unknown, ctx?: SetContext): Card {
  const r = rec(raw)
  const tcg = r.tcgplayer ? rec(r.tcgplayer) : null
  const cm = r.cardmarket ? rec(r.cardmarket) : null
  const finish = r.sub_type_name
  const info: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) if (k.startsWith('ext_')) info[k] = v
  return {
    id: str(r.id) ?? '',
    name: str(r.name) ?? '',
    cleanName: str(r.clean_name),
    number: str(r.card_number),
    rarity: str(r.rarity),
    cardType: str(r.card_type),
    productType: str(r.product_type),
    text: str(r.ext_description),
    variants: typeof finish === 'string' ? [finish] : [],
    setId: ctx?.setId ?? null,
    setCode: ctx?.setCode ?? null,
    setName: null,
    tcgplayer: tcg ? { url: str(tcg.url), prices: tcg.prices ? [tcgPrice(tcg.prices, finish)] : [] } : null,
    cardmarket: cm
      ? { productName: str(cm.product_name), url: str(cm.product_url), prices: cm.prices ? [cardmarketPrice(cm.prices, finish)] : [] }
      : null,
    info,
    raw,
  }
}
