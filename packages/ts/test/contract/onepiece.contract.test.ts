import { beforeAll, describe, expect, it } from 'vitest'
import { NotFoundError, type Card, type PokeWallet } from '../../src/index.js'
import { fail, HAS_KEY, liveClient } from './setup.js'

describe.skipIf(!HAS_KEY)('contract: One Piece (live API)', () => {
  let pw: PokeWallet
  let sample: Card

  beforeAll(() => {
    pw = liveClient()
  })

  it('search hides the flat pagination', async () => {
    const page = await pw.onepiece.search('luffy', { limit: 3 })
    expect(page.items).toHaveLength(3)
    expect(page.totalPages).toBe(Math.ceil(page.total / 3))
    sample = page.items[0]!
    expect(sample.id).toMatch(/^op_/)
    expect(sample.tcgplayer?.prices.length ?? 0).toBeLessThanOrEqual(1)
    // The raw payload is flat: no card_info.
    expect((sample.raw as any).card_info).toBeUndefined()
  })

  it('card and sets', async () => {
    const card = await pw.onepiece.card(sample.id)
    expect(card.id).toBe(sample.id)
    const sets = await pw.onepiece.sets({ language: 'en' })
    expect(sets.some((s) => s.code === 'OP01')).toBe(true)
    expect(sets[0]!.id).toMatch(/^-?\d+$/)
  })

  it('set listing carries the set identity from group_id', async () => {
    const page = await pw.onepiece.set('OP01', { limit: 3 })
    expect(page.set).toMatchObject({ code: 'OP01', id: '3188' })
    expect(page.items[0]).toMatchObject({ setId: '3188', setCode: 'OP01' })
    expect(page.total).toBeGreaterThan(100)
  })

  it('prices (set in the query), statistics, completion value', async () => {
    const prices = await pw.onepiece.prices('OP01')
    expect(prices.rows.length).toBeGreaterThan(100)
    expect(prices.setId).toBe('3188')
    const byId = await pw.onepiece.prices('3188')
    expect(byId.total).toBe(prices.total)
    const stats = await pw.onepiece.statistics('OP01')
    expect(stats.set.id).toBe('3188')
    const comp = await pw.onepiece.completionValue('OP01')
    expect(comp.cardmarket!.currency).toBe('EUR')
  })

  it('trending and top cards (growth needs CardMarket)', async () => {
    const t = await pw.onepiece.trending({ limit: 3 })
    expect(t.length).toBeGreaterThan(0)
    const top = await pw.onepiece.topCards({ limit: 3 })
    expect(top[0]!.id).toMatch(/^op_/)
    const growth = await pw.onepiece.topCards({ metric: 'growth', source: 'cm', limit: 3 })
    expect(growth[0]!.change7d).toMatch(/%$/)
  })

  it('unknown set is NotFoundError', async () => {
    expect(await fail(pw.onepiece.set('NOSUCHSET99'))).toBeInstanceOf(NotFoundError)
  })
})
