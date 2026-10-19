import { beforeAll, describe, expect, it } from 'vitest'
import {
  AmbiguousSetError,
  BadRequestError,
  NotFoundError,
  ValidationError,
  type Card,
  type PokeWallet,
} from '../../src/index.js'
import { fail, HAS_KEY, liveClient } from './setup.js'

describe.skipIf(!HAS_KEY)('contract: Pokémon (live API)', () => {
  let pw: PokeWallet
  let sample: Card

  beforeAll(() => {
    pw = liveClient()
  })

  it('search: pagination, normalized card, and what the API really sends for prices', async () => {
    const page = await pw.pokemon.search('charizard', { limit: 3 })
    expect(page.items).toHaveLength(3)
    expect(page.limit).toBe(3)
    expect(page.totalPages).toBe(Math.ceil(page.total / 3))
    sample = page.items[0]!
    expect(sample.id).toMatch(/^pk_/)
    expect(sample.setCode).toBeTruthy()
    expect(sample.setId).toMatch(/^-?\d+$/)
    const p = sample.tcgplayer!.prices[0]!
    // What the wire carries: numbers (or null) for per-card prices.
    for (const k of ['market_price', 'low_price'] as const) {
      expect(['number', 'object']).toContain(typeof (p.raw as any)[k])
    }
    expect(p.market === null || typeof p.market === 'number').toBe(true)
    expect(pw.lastRateLimit?.limitHour).toBeGreaterThan(0)
  })

  it('card: same id, same identity as the search hit', async () => {
    const card = await pw.pokemon.card(sample.id)
    expect(card.id).toBe(sample.id)
    expect(card.name).toBe(sample.name)
    expect(card.setCode).toBe(sample.setCode)
  })

  it('sets and one set listing (the set_code difference is hidden)', async () => {
    const sets = await pw.pokemon.sets({ language: 'eng' })
    expect(sets.length).toBeGreaterThan(100)
    const page = await pw.pokemon.set('PLF', { limit: 3 })
    expect(page.set).toMatchObject({ code: 'PLF', id: '1382' })
    expect(page.items[0]!.setCode).toBe('PLF')
    // The raw listing still holds the numeric id in card_info.set_code.
    expect((page.items[0]!.raw as any).card_info.set_code).toBe('1382')
  })

  it('ambiguous set: 200 on the listing, 300 on prices, 409 on statistics, one error class', async () => {
    const a = await fail(pw.pokemon.set('PR'))
    expect(a).toBeInstanceOf(AmbiguousSetError)
    expect(a.matches.length).toBeGreaterThan(1)
    expect(a.matches[0].setId).toMatch(/^-?\d+$/)

    const b = await fail(pw.pokemon.prices('PR'))
    expect(b).toBeInstanceOf(AmbiguousSetError)
    expect(b.status).toBe(300)

    const c = await fail(pw.pokemon.statistics('PR'))
    expect(c).toBeInstanceOf(AmbiguousSetError)
    expect(c.status).toBe(409)

    // The id from a match selects one set.
    const ok = await pw.pokemon.set(a.matches[0].setId, { limit: 1 })
    expect(ok.items).toHaveLength(1)
  })

  it('statistics and completion value', async () => {
    const s = await pw.pokemon.statistics('PLF')
    expect(s.tcgplayer!.avg).toBeTypeOf('number')
    // The wire sends this average as a string; the raw value stays reachable.
    expect(typeof (s.raw as any).price_statistics.tcgplayer.avg_market_price).toBe('string')
    const c = await pw.pokemon.completionValue('PLF')
    expect(c.tcgplayer!.currency).toBe('USD')
    expect(c.set.code).toBe('PLF')
  })

  it('trending (7d and 30d) and top cards (price and growth)', async () => {
    const t7 = await pw.pokemon.trending({ limit: 3 })
    expect(t7.length).toBeGreaterThan(0)
    expect(t7[0]!.changePct).toBeTypeOf('number')
    const t30 = await pw.pokemon.trending({ period: '30d', limit: 3 })
    expect(t30.length).toBeGreaterThan(0)
    const price = await pw.pokemon.topCards({ limit: 3 })
    expect(price[0]!.price).toBeTypeOf('number')
    const growth = await pw.pokemon.topCards({ metric: 'growth', limit: 3 })
    expect(growth[0]!.change7d).toMatch(/%$/)
  })

  it('price history', async () => {
    const h = await pw.pokemon.priceHistory(sample.id)
    expect(Object.keys(h.tcgplayer ?? h.cardmarket ?? {}).length).toBeGreaterThan(0)
  })

  it('errors: unknown set is NotFoundError, a garbage id is BadRequestError', async () => {
    expect(await fail(pw.pokemon.set('ZZZZNOSUCHSET'))).toBeInstanceOf(NotFoundError)
    expect(await fail(pw.pokemon.card('pk_not-a-real-id'))).toBeInstanceOf(BadRequestError)
  })

  it('refuses limit=-1 locally before sending', async () => {
    expect(await fail(pw.pokemon.search('pikachu', { limit: -1 }))).toBeInstanceOf(ValidationError)
  })
})
