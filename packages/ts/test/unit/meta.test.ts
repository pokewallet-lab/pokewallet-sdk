import { describe, expect, it } from 'vitest'
import { PokeWallet } from '../../src/client.js'
import { UnavailableError } from '../../src/errors.js'
import { fixture } from './fixtures.js'
import { fail, mockFetch, noSleep, TEST_KEY } from './helpers.js'

const sdk = (replies: Parameters<typeof mockFetch>[0]) => {
  const m = mockFetch(replies)
  return { pw: new PokeWallet({ apiKey: TEST_KEY, fetch: m.fetch, sleep: noSleep }), calls: m.calls }
}

describe('listGames', () => {
  it('returns a typed array of the ten games, not the raw envelope', async () => {
    const games = await sdk([{ body: fixture('games') }]).pw.listGames()
    expect(Array.isArray(games)).toBe(true)
    expect(games).toHaveLength(10)
    const mtg = games.find((g) => g.code === 'mtg')!
    expect(mtg).toMatchObject({ name: 'Magic: the Gathering', endpoints: { search: '/mtg/search?q=', sets: '/mtg/sets' }, proEndpoints: { prices: '/mtg/prices/:set', top_cards: '/mtg/analytics/top-cards' } })
    expect((mtg.raw as any).pro_endpoints.trending).toBe('/mtg/sets/trending')
    expect(games.map((g) => g.code)).toEqual(['mtg', 'ygo', 'cfv', 'dbs', 'fab', 'dgm', 'swu', 'lor', 'rft', 'cpk'])
  })

  it('skips entries with an unknown code instead of failing', async () => {
    const body = fixture('games')
    body.data.push({ code: 'zzz', name: 'Future game', endpoints: {}, pro_endpoints: {} })
    expect(await sdk([{ body }]).pw.listGames()).toHaveLength(10)
  })
})

describe('health', () => {
  it('returns a typed report with the per-service checks', async () => {
    const h = await sdk([{ body: fixture('health') }]).pw.health()
    expect(h).toMatchObject({ status: 'healthy', version: '1.7.1', region: 'MXP', responseTime: 82 })
    expect(h.checks.database).toEqual({ status: 'healthy', message: null, responseTime: 78 })
    expect(Object.keys(h.checks).sort()).toEqual(['cache', 'database', 'storage'])
    expect(h.timestamp).toMatch(/^2026-/)
    expect((h.raw as any).status).toBe('healthy')
  })

  it('an unhealthy 503 report is data: returned, with the failing check, and never retried', async () => {
    const { pw, calls } = sdk([{ status: 503, body: fixture('health-unhealthy') }])
    const h = await pw.health()
    expect(h.status).toBe('unhealthy')
    expect(h.checks.database).toMatchObject({ status: 'unhealthy', message: 'Connection failed' })
    expect(h.message).toMatch(/Critical services/)
    expect(calls).toHaveLength(1)
  })

  it('a 503 without a report (edge error page, plain error body) is still UnavailableError and is retried', async () => {
    const a = sdk([{ status: 503, headers: { 'retry-after': '5' }, body: { error: 'Temporarily unavailable' } }])
    expect(await fail(a.pw.health())).toBeInstanceOf(UnavailableError)
    expect(a.calls).toHaveLength(3)
    const b = sdk([{ status: 503 }])
    expect(await fail(b.pw.health())).toBeInstanceOf(UnavailableError)
  })
})
