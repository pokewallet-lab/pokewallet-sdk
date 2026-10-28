import { describe, expect, it } from 'vitest'
import { PokeWallet } from '../../src/client.js'
import {
  AmbiguousSetError,
  ValidationError,
} from '../../src/errors.js'
import { fixture } from './fixtures.js'
import { fail, mockFetch, noSleep, TEST_KEY, type Reply } from './helpers.js'

function sdk(replies: Reply[]) {
  const m = mockFetch(replies)
  return { pw: new PokeWallet({ apiKey: TEST_KEY, fetch: m.fetch, sleep: noSleep }), calls: m.calls }
}

describe('Pokémon cards', () => {
  it('normalizes a search page and computes totalPages itself', async () => {
    const { pw, calls } = sdk([{ body: fixture('pokemon-search') }])
    const page = await pw.pokemon.search('weedle', { limit: 3 })
    expect(calls[0]!.url).toBe('https://api.pokewallet.io/search?q=weedle&limit=3')
    expect(page).toMatchObject({ page: 1, limit: 3, total: 66, totalPages: 22, truncated: false })
    const c = page.items[0]!
    expect(c.id).toMatch(/^pk_/)
    expect(c.setCode).toBe('BS2')
    expect(c.setId).toBe('605')
    expect(typeof c.tcgplayer!.prices[0]!.market).toBe('number')
    expect(c.tcgplayer!.prices[0]!.variant).toBe('Normal')
    expect(c.cardmarket!.prices[0]!.variant).toBe('normal')
    expect(c.info).toHaveProperty('hp')
    expect(c.variants).toEqual(['Normal'])
    expect(c.raw).toBeTypeOf('object')
  })

  it('exposes truncated on a Pokémon search too', async () => {
    const body = fixture('pokemon-search')
    body.metadata.truncated = true
    expect((await sdk([{ body }]).pw.pokemon.search('weedle', { limit: 3 })).truncated).toBe(true)
  })

  it('takes the set pair from the set object in a set listing', async () => {
    const body = fixture('pokemon-set')
    expect(body.cards[0].card_info).toMatchObject({ set_code: 'PLF', set_id: '1382' }) // card_info now agrees with the set object
    const { pw } = sdk([{ body }])
    const page = await pw.pokemon.set('PLF', { limit: 3 })
    expect(page.set).toMatchObject({ id: '1382', code: 'PLF', name: 'Plasma Freeze' })
    expect(page.items.every((c) => c.setId === '1382' && c.setCode === 'PLF')).toBe(true)
    expect(page.totalPages).toBe(43)
  })

  it('turns a 200 disambiguation into AmbiguousSetError', async () => {
    const { pw } = sdk([{ body: fixture('pokemon-set-ambiguous') }])
    const err = await fail(pw.pokemon.set('PR'))
    expect(err).toBeInstanceOf(AmbiguousSetError)
    expect(err.matches[0]).toMatchObject({ setId: '1938', setCode: 'PR', language: 'eng' })
  })

  it('turns 300 (prices) and 409 (statistics) into the same error', async () => {
    const matches = fixture('pokemon-set-ambiguous').matches
    const a = sdk([{ status: 300, body: { disambiguation: true, matches, total: matches.length } }])
    expect(await fail(a.pw.pokemon.prices('PR'))).toBeInstanceOf(AmbiguousSetError)
    const b = sdk([{ status: 409, body: { error: 'Ambiguous set code', message: 'm', matches } }])
    expect(await fail(b.pw.pokemon.statistics('PR'))).toBeInstanceOf(AmbiguousSetError)
  })

  it('lists sets', async () => {
    const { pw } = sdk([{ body: fixture('pokemon-sets') }])
    const sets = await pw.pokemon.sets({ language: 'jap' })
    expect(sets[0]).toMatchObject({ id: '24146', code: '10M', language: 'jap', cardCount: 11 })
  })

  it('passes set_code for a plain card number', async () => {
    const { pw, calls } = sdk([{ body: fixture('pokemon-card') }])
    const card = await pw.pokemon.card('086/078', { setCode: 'SV8a' })
    expect(calls[0]!.url).toBe('https://api.pokewallet.io/cards/086%2F078?set_code=SV8a')
    expect(card.name).toBe('Weedle')
  })

  it('converts numeric strings to numbers and keeps the raw value', async () => {
    const body = fixture('pokemon-card')
    body.tcgplayer.prices[0].market_price = '1.50'
    body.tcgplayer.prices[0].low_price = 'n/a'
    const { pw } = sdk([{ body }])
    const p = (await pw.pokemon.card('pk_x')).tcgplayer!.prices[0]!
    expect(p.market).toBe(1.5)
    expect(p.low).toBeNull()
    expect((p.raw as any).market_price).toBe('1.50')
  })
})

describe('Pro endpoints', () => {
  it('normalizes statistics: string averages become numbers, set_info has set_id and the real set_code', async () => {
    const { pw } = sdk([{ body: fixture('pokemon-statistics') }])
    const s = await pw.pokemon.statistics('PLF')
    expect(s.set).toMatchObject({ id: '1382', code: 'PLF', name: 'Plasma Freeze', totalCards: 122 })
    expect(s.tcgplayer!.avg).toBe(45.96)
    expect(s.tcgplayer!.mostExpensive).toMatchObject({ id: expect.stringMatching(/^pk_/), name: 'Ultra Ball', price: 1199.51 })
    expect(s.cardmarket!.trendDirection).toBe('up')
    expect(s.rarityBreakdown.Common).toBe(32)
    expect((s.raw as any).price_statistics.tcgplayer.avg_market_price).toBe('45.96')
  })

  it('normalizes completion value, trending, top cards and price history', async () => {
    const c = await sdk([{ body: fixture('pokemon-completion') }]).pw.pokemon.completionValue('PLF')
    expect(c.set.code).toBe('PLF')
    expect(c.tcgplayer).toMatchObject({ currency: 'USD', market: 4950.71 })
    expect(c.byRarity.Common).toEqual({ count: 32, totalCost: 15.79 })

    const t = await sdk([{ body: fixture('pokemon-trending') }]).pw.pokemon.trending({ period: '7d' })
    expect(t[0]).toMatchObject({ change: '+164.3%', changePct: 164.3, cardCount: 17 })
    expect(t[0]!.set).toMatchObject({ id: '1422', code: 'POP' })

    const top = await sdk([{ body: fixture('pokemon-top-growth') }]).pw.pokemon.topCards({ metric: 'growth' })
    expect(top[0]).toMatchObject({ price: 1498.99, change7d: '+29879.8%', setCode: 'HP', setId: '1379' })

    const h = await sdk([{ body: fixture('pokemon-price-history') }]).pw.pokemon.priceHistory('pk_x')
    expect(h.tcgplayer!.Normal!.price[7]).toBe(0.37)
    expect(h.tcgplayer!.Normal!.change[30]).toBe('+12.5%')
    expect(h.cardmarket!.holo!.current.trend).toBe(0.8)
  })

  it('normalizes set prices for Pokémon (group_id) and the games (set_id)', async () => {
    const p = await sdk([{ body: fixture('pokemon-prices') }]).pw.pokemon.prices('PLF', { source: 'tcg' })
    expect(p).toMatchObject({ setId: '1382', setCode: 'PLF', source: 'both', total: 227 })
    expect(p.rows[0]!.tcgplayer!.market).toBe(0.37)
    expect(p.rows[0]!.variant).toBe('Normal')

    const g = await sdk([{ body: fixture('mtg-prices') }]).pw.games.mtg.prices('FRA')
    expect(g.setId).toBe('24684')
    expect(g.rows[0]!.cardmarket!.trend).toBe(14.03)
  })
})

describe('One Piece', () => {
  it('hides the flat pagination and the ext_* shape', async () => {
    const { pw, calls } = sdk([{ body: fixture('op-search') }])
    const page = await pw.onepiece.search('cavendish', { limit: 3 })
    expect(calls[0]!.url).toBe('https://api.pokewallet.io/op/search?q=cavendish&limit=3')
    expect(page).toMatchObject({ page: 1, limit: 3, total: 37, totalPages: 13 })
    const c = page.items[0]!
    expect(c.id).toMatch(/^op_/)
    expect(c.rarity).toBe('SR')
    expect(page.items.map((x) => x.productType)).toEqual(['card', 'card', 'card'])
    expect(c.info.ext_color).toBe('Green')
    expect(c.tcgplayer!.prices).toHaveLength(1)
    expect(c.tcgplayer!.prices[0]).toMatchObject({ variant: 'Foil' })
    expect(c.cardmarket!.prices.length).toBeGreaterThan(0)
    expect(c).toMatchObject({ setId: '23333', setCode: 'EB-01', setName: 'Extra Booster: Memorial Collection' })
    expect(page.items.map((x) => x.setCode)).toEqual(['EB-01', 'OP-PR', 'PRB-02'])
  })

  it('reads the set of a card from the entry itself', async () => {
    const { pw, calls } = sdk([{ body: fixture('op-card') }])
    const c = await pw.onepiece.card('op_abc')
    expect(calls[0]!.url).toBe('https://api.pokewallet.io/op/cards/op_abc')
    expect(c).toMatchObject({ number: 'OP01-001', setId: '3188', setCode: 'OP01', setName: 'Romance Dawn' })
  })

  it('falls back to group_id when an entry has no set_id', async () => {
    const { set_id: _, ...entry } = fixture('op-card')
    const c = await sdk([{ body: entry }]).pw.onepiece.card('op_abc')
    expect(c.setId).toBe('3188')
  })

  it('reads set identity from the set object (group_id)', async () => {
    const page = await sdk([{ body: fixture('op-set') }]).pw.onepiece.set('OP01', { limit: 3 })
    expect(page.set).toMatchObject({ id: '3188', code: 'OP01', name: 'Romance Dawn' })
    expect(page.items[0]).toMatchObject({ setId: '3188', setCode: 'OP01', setName: null, number: 'OP01-001' })
    expect(page.total).toBe(159)
  })

  it("prefers an entry's own set over the listing's", async () => {
    const base = fixture('op-set')
    const own = { ...base.data[0], set_name: 'Romance Dawn (JP)', set_code: 'OP01-JP', set_id: '-3', group_id: '-3' }
    const page = await sdk([{ body: { ...base, data: [own] } }]).pw.onepiece.set('OP01')
    expect(page.items[0]).toMatchObject({ setId: '-3', setCode: 'OP01-JP', setName: 'Romance Dawn (JP)' })
  })

  it('sends set prices in the query: set_code for codes, group_id for numbers', async () => {
    const a = sdk([{ body: fixture('op-prices') }])
    const res = await a.pw.onepiece.prices('OP01')
    expect(a.calls[0]!.url).toBe('https://api.pokewallet.io/op/prices?set_code=OP01')
    expect(res.setId).toBe('3188')
    const b = sdk([{ body: fixture('op-prices') }])
    await b.pw.onepiece.prices('-3')
    expect(b.calls[0]!.url).toBe('https://api.pokewallet.io/op/prices?group_id=-3')
  })

  it('lists sets with group_id as id; statistics/trending/top cards use /op routes', async () => {
    const sets = await sdk([{ body: fixture('op-sets') }]).pw.onepiece.sets()
    expect(sets[0]).toMatchObject({ id: '-3', code: 'OP01-JP', language: 'jp', cardCount: 155, sealedCount: 0 })

    const stats = sdk([{ body: fixture('op-statistics') }])
    const s = await stats.pw.onepiece.statistics('OP01')
    expect(stats.calls[0]!.url).toBe('https://api.pokewallet.io/op/sets/OP01/statistics')
    expect(s.set.id).toBe('3188')
    expect(s.cardmarket!.mostExpensive!.id).toMatch(/^op_/)

    const tr = await sdk([{ body: fixture('op-trending') }]).pw.onepiece.trending()
    expect(tr[0]!.set).toMatchObject({ id: '-7', code: 'EB-02-JP' })

    const top = await sdk([{ body: fixture('op-top-cards') }]).pw.onepiece.topCards()
    expect(top[0]).toMatchObject({ price: 13000, setCode: 'OP11', setId: '24241' })
  })

  it('refuses periods, finishes and options the API does not have', async () => {
    const { pw, calls } = sdk([{ body: {} }])
    expect(await fail(pw.onepiece.trending({ period: '30d' as any }))).toBeInstanceOf(ValidationError)
    expect(await fail(pw.pokemon.trending({ period: '30d' as any }))).toBeInstanceOf(ValidationError)
    expect(await fail(pw.pokemon.statistics('PLF', { variant: 'holo' as any }))).toBeInstanceOf(ValidationError)
    expect(await fail(pw.onepiece.prices('OP01', { source: 'tcg' }))).toBeInstanceOf(ValidationError)
    expect(calls).toHaveLength(0)
  })
})

describe('ten games', () => {
  it('routes under the game prefix and exposes truncated', async () => {
    const body = fixture('mtg-search')
    body.metadata.truncated = true
    const { pw, calls } = sdk([{ body }])
    const page = await pw.games.mtg.search('Emrakul')
    expect(calls[0]!.url).toBe('https://api.pokewallet.io/mtg/search?q=Emrakul')
    expect(page.truncated).toBe(true)
    expect(page.items[0]!.info).toMatchObject({ p: '15', t: '15' })
  })

  it('lists a set and unifies the 200 disambiguation', async () => {
    const page = await sdk([{ body: fixture('mtg-set') }]).pw.games.mtg.set('FRA', { limit: 3 })
    expect(page.set).toMatchObject({ id: '24684', code: 'FRA' })
    expect(page.totalPages).toBe(261)
    const err = await fail(sdk([{ body: fixture('mtg-set-ambiguous') }]).pw.games.mtg.set('MOC'))
    expect(err).toBeInstanceOf(AmbiguousSetError)
    expect(err.matches.length).toBeGreaterThan(1)
  })

  it('rejects one-letter game queries and 30d trending before any request', async () => {
    const { pw, calls } = sdk([{ body: {} }])
    expect(await fail(pw.games.ygo.search('a'))).toBeInstanceOf(ValidationError)
    expect(await fail(pw.games.ygo.trending({ period: '30d' as any }))).toBeInstanceOf(ValidationError)
    expect(calls).toHaveLength(0)
  })

  it('works with a runtime game code', async () => {
    const { pw, calls } = sdk([{ body: fixture('mtg-card') }])
    await pw.game('mtg').card('mtg_abc')
    expect(calls[0]!.url).toBe('https://api.pokewallet.io/mtg/cards/mtg_abc')
  })
})

describe('client-side validation', () => {
  it.each([
    ['limit 0', () => sdkCall((pw) => pw.pokemon.search('x', { limit: 0 }))],
    ['limit -1', () => sdkCall((pw) => pw.pokemon.search('x', { limit: -1 }))],
    ['limit above 100', () => sdkCall((pw) => pw.pokemon.search('x', { limit: 101 }))],
    ['limit above 200 on a set', () => sdkCall((pw) => pw.pokemon.set('PLF', { limit: 201 }))],
    ['non-integer limit', () => sdkCall((pw) => pw.onepiece.search('x', { limit: 2.5 }))],
    ['page 0', () => sdkCall((pw) => pw.games.mtg.search('xx', { page: 0 }))],
    ['empty id', () => sdkCall((pw) => pw.pokemon.card('  '))],
    ['trending limit above 50', () => sdkCall((pw) => pw.pokemon.trending({ limit: 51 }))],
  ])('%s throws ValidationError and sends nothing', async (_name, run) => {
    const { err, calls } = await run()
    expect(err).toBeInstanceOf(ValidationError)
    expect(calls).toHaveLength(0)
  })

  async function sdkCall(fn: (pw: PokeWallet) => Promise<unknown>) {
    const { pw, calls } = sdk([{ body: {} }])
    return { err: await fail(fn(pw)), calls }
  }
})

describe('pagination iterators', () => {
  function pages(total: number, limit: number, cardsPer: (n: number) => number) {
    const base = fixture('pokemon-set')
    const totalPages = Math.ceil(total / limit)
    const replies: Reply[] = []
    for (let p = 1; p <= totalPages; p++) {
      replies.push({
        body: { ...base, cards: base.cards.slice(0, cardsPer(p)), pagination: { page: p, limit, total, total_pages: totalPages } },
      })
    }
    return replies
  }

  it('setCards walks every page of the nested shape', async () => {
    const { pw, calls } = sdk(pages(5, 2, (p) => (p === 3 ? 1 : 2)))
    const got: string[] = []
    for await (const c of pw.pokemon.setCards('PLF', { limit: 2 })) got.push(c.id)
    expect(got).toHaveLength(5)
    expect(calls.map((c) => c.url.match(/page=(\d+)/)![1])).toEqual(['1', '2', '3'])
  })

  it('walks the flat One Piece shape too, honoring maxItems', async () => {
    const base = fixture('op-search')
    const replies: Reply[] = [1, 2, 3].map((p) => ({ body: { ...base, data: base.data.slice(0, 2), page: p, limit: 2, total: 6 } }))
    const { pw, calls } = sdk(replies)
    const got = []
    for await (const c of pw.onepiece.searchAll('x', { limit: 2, maxItems: 3 })) got.push(c)
    expect(got).toHaveLength(3)
    expect(calls).toHaveLength(2)
  })

  it('stops on an empty page even if total_pages lies', async () => {
    const base = fixture('pokemon-search')
    const { pw, calls } = sdk([{ body: { ...base, results: [], pagination: { page: 1, limit: 3, total: 99, total_pages: null } } }])
    const got = []
    for await (const c of pw.pokemon.searchAll('x')) got.push(c)
    expect(got).toHaveLength(0)
    expect(calls).toHaveLength(1)
  })
})

describe('misc', () => {
  it('builds image URLs without fetching and documents the header requirement', () => {
    const { pw, calls } = sdk([{ body: {} }])
    expect(pw.imageUrl('pk_abc', { size: 'high' })).toBe('https://api.pokewallet.io/images/pk_abc?size=high')
    expect(pw.imageUrl('op_abc')).toBe('https://api.pokewallet.io/images/op_abc')
    expect(pw.imageUrl('mtg_abc')).toBe('https://api.pokewallet.io/mtg/images/mtg_abc')
    expect(calls).toHaveLength(0)
  })

  it('exposes the quota of the last call', async () => {
    const { pw } = sdk([{ body: fixture('pokemon-card'), headers: { 'x-ratelimit-remaining-hour': '99', 'x-ratelimit-limit-hour': '100' } }])
    expect(pw.lastRateLimit).toBeNull()
    await pw.pokemon.card('pk_x')
    expect(pw.lastRateLimit).toMatchObject({ limitHour: 100, remainingHour: 99 })
  })

  it('keeps the User-Agent version in step with package.json', async () => {
    const { VERSION } = await import('../../src/version.js')
    const pkg = await import('../../package.json', { with: { type: 'json' } })
    expect(VERSION).toBe(pkg.default.version)
  })
})
