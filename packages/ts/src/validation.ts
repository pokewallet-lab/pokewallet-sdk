import { ValidationError } from './errors.js'

/** `page` must be a positive integer. */
export function checkPage(page: number | undefined): number | undefined {
  if (page === undefined) return undefined
  if (!Number.isInteger(page) || page < 1) throw new ValidationError(`page must be an integer >= 1 (got ${page})`)
  return page
}

/** `limit` must be an integer in [1, max]. Checked here so out-of-range values never reach the server. */
export function checkLimit(limit: number | undefined, max: number): number | undefined {
  if (limit === undefined) return undefined
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new ValidationError(`limit must be an integer between 1 and ${max} (got ${limit})`)
  }
  return limit
}

/** Only `7d` exists, in every world. */
export function checkPeriod(period: string | undefined): '7d' {
  if (period !== undefined && period !== '7d') throw new ValidationError(`period ${period} is not available (only 7d)`)
  return '7d'
}

/** `variant` is `normal` or `foil`. */
export function checkVariant(variant: string | undefined): 'normal' | 'foil' | undefined {
  if (variant === undefined) return undefined
  if (variant !== 'normal' && variant !== 'foil') throw new ValidationError(`variant must be normal or foil (got ${variant})`)
  return variant
}

export function checkText(name: string, value: string, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new ValidationError(`${name} must be at least ${min} character${min === 1 ? '' : 's'} long`)
  }
  return value.trim()
}

/** Path segment for a user-supplied id or set code. */
export function seg(value: string): string {
  return encodeURIComponent(checkText('id', value))
}

/** Languages the API serves card data in, besides the default one (`en` and `ja` are the default). */
export const CARD_LANGUAGES = ['de', 'es', 'fr', 'it', 'pt', 'ko', 'zh-cn', 'zh-tw', 'th', 'id'] as const
export type CardLanguage = (typeof CARD_LANGUAGES)[number]

/**
 * `lang` for Pokémon cards: any case is accepted and sent in lowercase. `en`, `ja` and an absent
 * value mean the default language and send nothing. Anything else throws before the request.
 */
export function checkLang(lang: string | undefined): CardLanguage | undefined {
  if (lang === undefined) return undefined
  const value = typeof lang === 'string' ? lang.trim().toLowerCase() : ''
  if (value === 'en' || value === 'ja') return undefined
  if (!(CARD_LANGUAGES as readonly string[]).includes(value)) {
    throw new ValidationError(`lang must be one of ${CARD_LANGUAGES.join(', ')} (en and ja return the default language), got ${JSON.stringify(lang)}`)
  }
  return value as CardLanguage
}

/** One Piece and the ten games have no translations: `lang` is rejected instead of silently ignored. */
export function rejectLang(lang: string | undefined): void {
  if (lang !== undefined) throw new ValidationError('lang is only available for Pokémon cards')
}
