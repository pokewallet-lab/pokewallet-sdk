import type { SetSummary } from '../types.js'
import { num, rec, str } from './common.js'

/** Set entry from any list or detail. One Piece names the id `group_id`, everything else `set_id`. */
export function normalizeSet(raw: unknown): SetSummary {
  const r = rec(raw)
  return {
    id: str(r.set_id) ?? str(r.group_id) ?? '',
    code: str(r.set_code),
    name: str(r.name) ?? str(r.set_name) ?? '',
    language: str(r.language),
    releaseDate: str(r.release_date),
    cardCount: num(r.card_count ?? r.total_cards),
    sealedCount: num(r.sealed_count),
    raw,
  }
}
