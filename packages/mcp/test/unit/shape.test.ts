import { describe, expect, it } from 'vitest'
import { PokeWallet } from '@pokewallet/sdk'
import { cardDetail, cardSummary, completion, history, prune, setEntry, statistics, topCard, trendingEntry } from '../../src/shape.js'
import { fixture, stubFetch } from './helpers.js'

async function card(name: string, build: (pw: PokeWallet) => Promise<any>) {
  return build(new PokeWallet({ apiKey: 'pk_test_not_a_real_key', fetch: stubFetch([{ body: fixture(name) }]) }))
}

describe('prune', () => {
  it('drops nulls, empties and nested emptiness', () => {
    expect(prune({ a: null, b: '', c: [], d: {}, e: { f: null, g: 1 }, h: [null, 2] })).toEqual({ e: { g: 1 }, h: [2] })
    expect(prune({ a: null })).toBeUndefined()
    expect(prune(0)).toBe(0)
  })
})

describe('card shaping', () => {
  it('summarizes a card with market prices per finish and no nulls or raw fields', async () => {
    const c = await card('pokemon-card', (pw) => pw.pokemon.card('pk_x'))
    const s = cardSummary(c)
    expect(s).toMatchObject({ name: 'Weedle', set: 'Plasma Freeze (PLF)', number: '1/116', rarity: 'Common' })
    expect(s.tcgplayerUsd).toEqual({ Normal: 0.37, 'Reverse Holofoil': 1.59 })
    expect(s.cardmarketEur).toMatchObject({ normal: 0.2 })
    expect(JSON.stringify(s)).not.toMatch(/null|raw|updated|"low"|mid/)
    expect(JSON.stringify(s).length).toBeLessThan(600)
  })

  it('emits only the fields it chooses: unknown top-level fields of the payload never reach the output', async () => {
    const body = fixture('pokemon-card')
    body.some_unlisted_field = 4242424
    body.cardmarket.another_unlisted_field = 4242425
    const pw = new PokeWallet({ apiKey: 'pk_test_not_a_real_key', fetch: stubFetch([{ body }]) })
    const c = await pw.pokemon.card('pk_x')
    for (const out of [cardSummary(c), cardDetail(c)]) {
      expect(JSON.stringify(out)).not.toMatch(/4242424|4242425|unlisted/)
      expect(Object.keys(out).every((k) => ['id', 'name', 'set', 'setId', 'number', 'rarity', 'tcgplayerUsd', 'cardmarketEur', 'type', 'productType', 'text', 'finishes', 'details', 'links'].includes(k))).toBe(true)
    }
  })

  it('detail adds type, text, game fields and links; long text is clipped', async () => {
    const body = fixture('mtg-card')
    body.card_info.card_text = 'x'.repeat(2000)
    const pw = new PokeWallet({ apiKey: 'pk_test_not_a_real_key', fetch: stubFetch([{ body }]) })
    const d = cardDetail(await pw.games.mtg.card('mtg_x')) as any
    expect(d.text.length).toBeLessThanOrEqual(600)
    expect(d.details).toMatchObject({ p: '12', t: '12' })
    expect(d.links.tcgplayer).toMatch(/^https:\/\/www\.tcgplayer\.com/)
    expect(d.finishes.length).toBeGreaterThan(0)
  })

  it('keeps One Piece cards compact', async () => {
    const pw = new PokeWallet({ apiKey: 'pk_test_not_a_real_key', fetch: stubFetch([{ body: fixture('op-search') }]) })
    const page = await pw.onepiece.search('x', { limit: 3 })
    const s = cardSummary(page.items[0]!) as any
    expect(s).toMatchObject({ rarity: 'SR' })
    expect(s.tcgplayerUsd).toEqual({ Foil: 17.85 })
    expect(s.id).toMatch(/^op_/)
  })
})

describe('other shapes', () => {
  it('statistics, completion, trending, top cards, history and set entries are null-free', async () => {
    const pw = (name: string) => new PokeWallet({ apiKey: 'pk_test_not_a_real_key', fetch: stubFetch([{ body: fixture(name) }]) })
    const st = statistics(await pw('pokemon-statistics').pokemon.statistics('PLF')) as any
    expect(st.set).toEqual({ name: 'Plasma Freeze', code: 'PLF', setId: '1382' })
    expect(st.totalCards).toBe(122)
    expect(st.tcgplayerUsd).toMatchObject({ average: 45.96, mostExpensive: { name: 'Ultra Ball', id: expect.stringMatching(/^pk_/) } })
    const co = completion(await pw('pokemon-completion').pokemon.completionValue('PLF')) as any
    expect(co.byRarity.Common).toEqual({ cards: 32, cost: 15.79 })
    const tr = trendingEntry((await pw('pokemon-trending').pokemon.trending())[0]!) as any
    expect(tr).toMatchObject({ change: '+164.3%', cards: 17, set: { name: 'POP Series 1', code: 'POP', setId: '1422' } })
    expect(tr.topMovers.length).toBeLessThanOrEqual(3)
    const top = topCard((await pw('pokemon-top-growth').pokemon.topCards({ metric: 'growth' }))[0]!, true) as any
    expect(top).toMatchObject({ change7d: '+29879.8%', price: 1498.99 })
    expect(top).not.toHaveProperty('price7dAgo')
    const h = history(await pw('pokemon-price-history').pokemon.priceHistory('pk_x')) as any
    expect(h.tcgplayerUsd.Normal.priceDaysAgo['7d']).toBe(0.37)
    const s = setEntry((await pw('pokemon-sets').pokemon.sets())[0]!) as any
    expect(s).toEqual({ setId: '24146', code: '10M', name: '10th Movie Commemoration Set', language: 'jap', released: '3rd August, 2007', cards: 11 })
    for (const out of [st, co, tr, top, h, s]) expect(JSON.stringify(out)).not.toContain('null')
  })
})
