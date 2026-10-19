import { describe, expect, it } from 'vitest'
import { GAME_CODES, PokeWallet, ValidationError } from '../../src/index.js'
import { fail } from './setup.js'

// Needs no key: it runs even when POKEWALLET_API_KEY is unset, and ignores it when it is set.
describe('contract: public endpoints without a key (live API)', () => {
  it('health and listGames answer, and everything else refuses locally', async () => {
    const saved = process.env.POKEWALLET_API_KEY
    delete process.env.POKEWALLET_API_KEY
    try {
      const pw = new PokeWallet()
      const health = await pw.health()
      expect(health.status).toBe('healthy')
      expect(health.checks.database).toMatchObject({ status: 'healthy' })
      expect(health.version).toMatch(/^\d+\.\d+\.\d+/)
      expect(health.responseTime).toBeTypeOf('number')
      const games = await pw.listGames()
      expect(games).toHaveLength(10)
      expect(games.find((g) => g.code === 'mtg')).toMatchObject({ name: 'Magic: the Gathering', endpoints: { search: '/mtg/search?q=' }, proEndpoints: { prices: '/mtg/prices/:set' } })
      expect(games.map((g) => g.code).sort()).toEqual([...GAME_CODES].sort())
      expect(await fail(pw.pokemon.search('pikachu'))).toBeInstanceOf(ValidationError)
    } finally {
      if (saved !== undefined) process.env.POKEWALLET_API_KEY = saved
    }
  })
})
