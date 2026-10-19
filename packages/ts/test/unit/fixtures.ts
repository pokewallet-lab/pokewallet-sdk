import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Recorded answers (trimmed lists, no credentials) from `test/fixtures`. */
export function fixture<T = any>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/${name}.json`, import.meta.url)), 'utf8')) as T
}
