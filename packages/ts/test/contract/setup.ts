import { PokeWallet } from '../../src/index.js'

/** The key only ever comes from the environment; without it the contract suites skip. */
export const HAS_KEY = Boolean(process.env.POKEWALLET_API_KEY)

export function liveClient(): PokeWallet {
  return new PokeWallet({ apiKey: process.env.POKEWALLET_API_KEY })
}

/** Keys that must never appear in an answer, at any depth. */
const INTERNAL_FIELDS = ['product_id', 'encrypted_id', 'public_url', 'cardmarket_product_id']

export function internalFields(value: unknown): string[] {
  const text = JSON.stringify(value)
  return INTERNAL_FIELDS.filter((k) => text.includes(`"${k}"`))
}

/** Returns the rejection reason; fails if the promise does not reject. */
export const fail = (p: Promise<unknown>): Promise<any> =>
  p.then(
    () => {
      throw new Error('expected the promise to reject')
    },
    (e: unknown) => e,
  )
