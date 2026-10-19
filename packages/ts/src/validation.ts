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
