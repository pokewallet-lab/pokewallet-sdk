import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PokeWallet } from '../../src/client.js'
import { ValidationError } from '../../src/errors.js'
import { KEY_REQUIRED } from '../../src/http.js'
import { fixture } from './fixtures.js'
import { fail, mockFetch, TEST_KEY } from './helpers.js'

describe('client without an API key', () => {
  beforeEach(() => vi.stubEnv('POKEWALLET_API_KEY', ''))
  afterEach(() => vi.unstubAllEnvs())

  it('constructs without throwing and masks itself', () => {
    const pw = new PokeWallet({ fetch: mockFetch([{}]).fetch })
    expect(JSON.stringify(pw)).toContain('"apiKey":null')
  })

  it('health() and listGames() work and send no X-API-Key header', async () => {
    const m = mockFetch([{ body: fixture('health') }, { body: fixture('games') }])
    const pw = new PokeWallet({ fetch: m.fetch })
    expect((await pw.health()).status).toBe('healthy')
    expect((await pw.listGames()).map((g) => g.code)).toContain('mtg')
    expect(m.calls.map((c) => c.url)).toEqual(['https://api.pokewallet.io/health', 'https://api.pokewallet.io/games'])
    for (const c of m.calls) {
      expect(Object.keys(c.headers).map((h) => h.toLowerCase())).not.toContain('x-api-key')
      expect(c.headers['User-Agent']).toMatch(/^pokewallet-sdk-ts\//)
    }
  })

  it('every other method throws ValidationError with the same message before any request', async () => {
    const m = mockFetch([{ body: fixture('pokemon-search') }])
    const pw = new PokeWallet({ fetch: m.fetch })
    const calls: Array<() => Promise<unknown>> = [
      () => pw.pokemon.search('pikachu'),
      () => pw.pokemon.card('pk_x'),
      () => pw.pokemon.sets(),
      () => pw.pokemon.priceHistory('pk_x'),
      () => pw.onepiece.search('luffy'),
      () => pw.onepiece.prices('OP01'),
      () => pw.games.mtg.set('FRA'),
      () => pw.games.ygo.topCards(),
    ]
    for (const call of calls) {
      const err = await fail(call())
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.message).toBe('An API key is required: pass apiKey or set POKEWALLET_API_KEY')
      expect(err.message).toBe(KEY_REQUIRED)
    }
    expect(m.calls).toHaveLength(0)
  })

  it('still sends the header on the public endpoints when a key is set', async () => {
    const m = mockFetch([{ body: {} }])
    await new PokeWallet({ apiKey: TEST_KEY, fetch: m.fetch }).health()
    expect(m.calls[0]!.headers['X-API-Key']).toBe(TEST_KEY)
  })

  it('an empty or whitespace key counts as no key', async () => {
    const m = mockFetch([{ body: {} }])
    const pw = new PokeWallet({ apiKey: '   ', fetch: m.fetch })
    expect(await fail(pw.pokemon.sets())).toBeInstanceOf(ValidationError)
    expect(m.calls).toHaveLength(0)
  })
})
