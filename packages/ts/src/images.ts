import { ValidationError } from './errors.js'
import { DEFAULT_BASE_URL } from './version.js'
import { GAME_CODES, type GameCode } from './types.js'

export interface ImageUrlOptions {
  baseUrl?: string
  /** Pokémon only: `low` (default) or `high`. */
  size?: 'low' | 'high'
  /** Pokémon only: localized render (`it`, `fr`, `de`, `es`, `pt`). */
  lang?: string
  /** Pokémon only: set code, to disambiguate a plain card number. */
  set?: string
}

/**
 * Builds the image URL of a card from its id. Pure string work: nothing is fetched.
 *
 * The image routes are protected like every other route: the request MUST carry the
 * `X-API-Key` header, so the URL cannot be used directly in an `<img>` tag. Fetch it
 * yourself with the header, or proxy it server-side.
 */
export function imageUrl(id: string, options: ImageUrlOptions = {}): string {
  const clean = id.trim()
  if (!clean) throw new ValidationError('id is required')
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const game = GAME_CODES.find((g: GameCode) => clean.toLowerCase().startsWith(`${g}_`))
  const path = game ? `/${game}/images/${encodeURIComponent(clean)}` : `/images/${encodeURIComponent(clean)}`
  const qs = new URLSearchParams()
  if (!game) {
    if (options.size) qs.set('size', options.size)
    if (options.lang) qs.set('lang', options.lang)
    if (options.set) qs.set('set', options.set)
  }
  const s = qs.toString()
  return `${base}${path}${s ? `?${s}` : ''}`
}
