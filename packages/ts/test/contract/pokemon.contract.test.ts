import { beforeAll, describe, expect, it } from 'vitest'
import {
  AmbiguousSetError,
  BadRequestError,
  NotFoundError,
  ValidationError,
  type Card,
  type PokeWallet,
} from '../../src/index.js'
import { fail, HAS_KEY, internalFields, liveClient } from './setup.js'

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
    // Finishes are listed Normal first, then alphabetically; the search flags a capped candidate list.
    expect(sample.variants.length).toBeGreaterThan(0)
    for (const c of page.items) {
      const rest = c.variants.filter((v) => v !== 'Normal')
      if (c.variants.includes('Normal')) expect(c.variants[0]).toBe('Normal')
      expect(rest).toEqual([...rest].sort())
    }
    expect(page.truncated).toBeTypeOf('boolean')
  })

  it('no internal field leaves the API', async () => {
    const card = await pw.pokemon.card(sample.id)
    const answers = [
      sample.raw,
      card.raw,
      (await pw.pokemon.set('PLF', { limit: 2 })).items.map((c) => c.raw),
      (await pw.pokemon.prices('PLF')).raw,
      (await pw.pokemon.statistics('PLF')).raw,
      (await pw.pokemon.completionValue('PLF')).raw,
      (await pw.pokemon.topCards({ limit: 3 })).map((c) => c.raw),
      (await pw.pokemon.trending({ limit: 3 })).map((s) => s.raw),
    ]
    for (const a of answers) expect(internalFields(a)).toEqual([])
  })

  it('card: same id, same identity as the search hit', async () => {
    const card = await pw.pokemon.card(sample.id)
    expect(card.id).toBe(sample.id)
    expect(card.name).toBe(sample.name)
    expect(card.setCode).toBe(sample.setCode)
  })

  it('sets and one set listing (card_info agrees with the set object)', async () => {
    const sets = await pw.pokemon.sets({ language: 'eng' })
    expect(sets.length).toBeGreaterThan(100)
    const page = await pw.pokemon.set('PLF', { limit: 3 })
    expect(page.set).toMatchObject({ code: 'PLF', id: '1382' })
    expect(page.items[0]!.setCode).toBe('PLF')
    expect((page.items[0]!.raw as any).card_info).toMatchObject({ set_code: 'PLF', set_id: '1382' })
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
    expect(s.set).toMatchObject({ code: 'PLF', id: '1382' })
    expect(s.tcgplayer!.mostExpensive!.id).toMatch(/^pk_/)
    const foil = await pw.pokemon.statistics('PLF', { variant: 'foil' })
    expect(foil.set.totalCards).toBeLessThanOrEqual(s.set.totalCards!)
    // 'holo' is only a legacy alias on the wire: the SDK sends normal or foil.
    expect(await fail(pw.pokemon.statistics('PLF', { variant: 'holo' as any }))).toBeInstanceOf(ValidationError)
  })

  it('statistics total_cards counts cards: it equals the distinct non-sealed ids in the set prices', async () => {
    const [s, prices] = await Promise.all([pw.pokemon.statistics('PLF'), pw.pokemon.prices('PLF')])
    expect(prices.setId).toBe('1382')
    expect((prices.raw as any).group_id).toBe((prices.raw as any).set_id)
    expect(s.set.totalCards).toBe(new Set(prices.rows.filter((r) => r.productType !== 'sealed').map((r) => r.id)).size)
  })

  it('trending (7d only: 30d is refused before any request) and top cards (price and growth)', async () => {
    const t7 = await pw.pokemon.trending({ limit: 3 })
    expect(t7.length).toBeGreaterThan(0)
    expect(t7[0]!.changePct).toBeTypeOf('number')
    expect(t7[0]!.set.id).toBeTruthy()
    expect(await fail(pw.pokemon.trending({ period: '30d' as any }))).toBeInstanceOf(ValidationError)
    const price = await pw.pokemon.topCards({ limit: 5 })
    expect(price[0]!.price).toBeTypeOf('number')
    // The ranking is by market price, highest first, so the first item is the most expensive TCG card.
    const prices = price.map((c) => c.price!)
    expect(prices).toEqual([...prices].sort((a, b) => b - a))
    expect((price[0]!.raw as any).card_info).toMatchObject({ name: price[0]!.name })
    expect(price[0]!.raw).not.toHaveProperty('previous_price_7d')
    expect((await pw.pokemon.card(price[0]!.id)).id).toBe(price[0]!.id)
    const growth = await pw.pokemon.topCards({ metric: 'growth', limit: 3 })
    expect(growth[0]!.change7d).toMatch(/%$/)
  })

  it('price history', async () => {
    const h = await pw.pokemon.priceHistory(sample.id)
    expect(Object.keys(h.tcgplayer ?? h.cardmarket ?? {}).length).toBeGreaterThan(0)
  })

  it('Trainer Gallery and Galarian Gallery sets carry CardMarket prices everywhere', async () => {
    for (const code of ['CRZ:GG', 'SWSH09:TG', 'SWSH10:TG', 'SWSH11: TG', 'SWSH12: TG']) {
      const prices = await pw.pokemon.prices(code)
      expect(prices.rows.length).toBeGreaterThan(0)
      expect(prices.rows.filter((r) => r.cardmarket === null)).toEqual([])
    }
    const listing = await pw.pokemon.set('CRZ:GG', { limit: 3 })
    expect(listing.items.every((c) => c.cardmarket !== null)).toBe(true)
    const card = await pw.pokemon.card(listing.items[0]!.id)
    expect(card.cardmarket).not.toBeNull()
    const found = await pw.pokemon.search('Eevee Crown Zenith', { limit: 5 })
    expect(found.items.length).toBeGreaterThan(0)
    expect(found.items.every((c) => c.cardmarket !== null)).toBe(true)
  })

  it('errors: unknown set is NotFoundError, a garbage id is BadRequestError', async () => {
    expect(await fail(pw.pokemon.set('ZZZZNOSUCHSET'))).toBeInstanceOf(NotFoundError)
    expect(await fail(pw.pokemon.card('pk_not-a-real-id'))).toBeInstanceOf(BadRequestError)
  })

  it('refuses limit=-1 locally before sending', async () => {
    expect(await fail(pw.pokemon.search('pikachu', { limit: -1 }))).toBeInstanceOf(ValidationError)
  })
})
