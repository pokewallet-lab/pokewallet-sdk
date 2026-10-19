import type { SetRef } from '../types.js'

export type Rec = Record<string, unknown>

export const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export function str(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

/** Numbers pass through, numeric strings are converted, everything else is null. */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const NUMERIC_ID = /^-?\d+$/

/**
 * Some answers put the numeric set id in a field named `set_code` and omit `set_id`
 * (Pokémon statistics, trending, set listings). When no id is given and the "code" is
 * purely numeric, it is the id.
 */
export function setPair(code: unknown, id: unknown): { id: string | null; code: string | null } {
  const c = str(code)
  const i = str(id)
  if (i === null && c !== null && NUMERIC_ID.test(c)) return { id: c, code: null }
  return { id: i, code: c }
}

export function setRef(name: unknown, code: unknown, id: unknown): SetRef {
  return { ...setPair(code, id), name: str(name) }
}
