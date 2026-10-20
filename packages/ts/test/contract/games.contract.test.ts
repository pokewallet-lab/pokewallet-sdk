import { beforeAll, describe, expect, it } from 'vitest'
import { AmbiguousSetError, GAME_CODES, NotFoundError, ValidationError, type PokeWallet } from '../../src/index.js'
import { fail, HAS_KEY, internalFields, liveClient } from './setup.js'

describe.skipIf(!HAS_KEY)('contract: ten games (live API)', () => {
  let pw: PokeWallet

  beforeAll(() => {
    pw = liveClient()
  })

  it('/games lists the same ten codes the SDK knows', async () => {
    const games = await pw.listGames()
    expect(games).toHaveLength(10)
    expect(games.map((g) => g.code).sort()).toEqual([...GAME_CODES].sort())
  })

  it.each(GAME_CODES)('%s: search answers through the unified interface', async (code) => {
    const page = await pw.games[code].search('dragon', { limit: 1 })
    expect(page.items.length).toBeLessThanOrEqual(1)
    if (page.items[0]) expect(page.items[0].id.startsWith(`${code}_`) || /^[a-f0-9]{64}$/.test(page.items[0].id)).toBe(true)
  })

  it('mtg: set listing, card, and the user agent is accepted', async () => {
    const page = await pw.games.mtg.set('FRA', { limit: 3 })
    expect(page.set).toMatchObject({ code: 'FRA' })
    expect(page.items).toHaveLength(3)
    const card = await pw.games.mtg.card(page.items[0]!.id)
    expect(card.id).toBe(page.items[0]!.id)
    expect(card.info).toHaveProperty('sub_type')
  })

  it('mtg: ambiguous set is 200 on the listing and 409 on a Pro route, same error', async () => {
    const a = await fail(pw.games.mtg.set('MOC'))
    expect(a).toBeInstanceOf(AmbiguousSetError)
    expect(a.matches.length).toBeGreaterThan(1)
    const b = await fail(pw.games.mtg.statistics('MOC'))
    expect(b).toBeInstanceOf(AmbiguousSetError)
    expect(b.status).toBe(409)
  })

  it('mtg: no internal field leaves the API', async () => {
    const page = await pw.games.mtg.search('Emrakul', { limit: 3 })
    const prices = await pw.games.mtg.prices('FRA')
    for (const a of [page.items.map((c) => c.raw), prices.raw]) expect(internalFields(a)).toEqual([])
  })

  it('mtg: Pro endpoints', async () => {
    const s = await pw.games.mtg.statistics('FRA')
    expect(s.set).toMatchObject({ code: 'FRA', id: '24684' })
    const prices = await pw.games.mtg.prices('FRA')
    expect(s.set.totalCards).toBe(new Set(prices.rows.filter((r) => r.productType !== 'sealed').map((r) => r.id)).size)
    const t = await pw.games.mtg.trending({ limit: 3 })
    expect(t.length).toBeGreaterThan(0)
    expect(await fail(pw.games.mtg.trending({ period: '30d' as any }))).toBeInstanceOf(ValidationError)
    const top = await pw.games.mtg.topCards({ metric: 'growth', source: 'cm', limit: 3 })
    expect(top.length).toBeGreaterThan(0)
  })

  it('mtg: unknown set suggests alternatives and is NotFoundError', async () => {
    expect(await fail(pw.games.mtg.set('NOSUCHSETZZ'))).toBeInstanceOf(NotFoundError)
  })
})
