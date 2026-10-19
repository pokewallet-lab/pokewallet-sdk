import { format, inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { HttpClient } from '../../src/http.js'
import { PokeWallet } from '../../src/client.js'
import { NetworkError } from '../../src/errors.js'
import { fail, mockFetch, noSleep } from './helpers.js'

// Distinctive on purpose, so a leak cannot hide behind a common substring.
const SECRET = 'pk_example_FAKEKEY0123456789abcdef'

function everyRendering(value: unknown): string[] {
  return [
    JSON.stringify(value),
    String(value),
    inspect(value, { depth: 12, showHidden: true, getters: true }),
    inspect(value, { depth: null, showProxy: true }),
    format('%o', value),
    format('%O', value),
    format('%s', value),
    format('%j', value),
  ]
}

describe('API key never leaks from the client objects', () => {
  const m = mockFetch([{ body: {} }])
  const http = new HttpClient({ apiKey: SECRET, fetch: m.fetch })
  const pw = new PokeWallet({ apiKey: SECRET, fetch: m.fetch })

  it.each([
    ['HttpClient', () => http],
    ['PokeWallet', () => pw],
    ['pokemon world', () => pw.pokemon],
    ['onepiece world', () => pw.onepiece],
    ['a game world', () => pw.games.mtg],
  ])('%s: stringify, inspect and format show only the masked form', (_n, get) => {
    for (const text of everyRendering(get())) expect(text).not.toContain(SECRET)
    expect(inspect(http)).toContain('pk_***')
    expect(JSON.stringify(pw)).toContain('pk_***')
  })

  it('exposes no own property, symbol or enumerable key holding the key', () => {
    for (const obj of [http, pw, pw.pokemon]) {
      const props = [...Object.getOwnPropertyNames(obj), ...Object.getOwnPropertySymbols(obj).map(String)]
      expect(props.join(',')).not.toContain(SECRET)
      for (const k of props) expect(String((obj as any)[k]?.valueOf?.() ?? '')).not.toContain(SECRET)
    }
    expect(Object.keys(http)).not.toContain('key')
  })

  it('still authenticates requests with the key', async () => {
    await http.get('/health')
    expect(m.calls[0]!.headers['X-API-Key']).toBe(SECRET)
  })
})

describe('API key never leaks from errors or raw payloads', () => {
  it('a server that echoes the key in its error body does not put it in the error', async () => {
    const m = mockFetch([{ status: 401, body: { error: 'Authentication failed', message: `bad key ${SECRET}`, example: SECRET } }])
    const err = await fail(new HttpClient({ apiKey: SECRET, fetch: m.fetch }).get('/sets'))
    for (const text of everyRendering(err)) expect(text).not.toContain(SECRET)
    expect(JSON.stringify(err.body)).toContain('pk_***')
    expect(err.message).not.toContain(SECRET)
  })

  it('a server that echoes the key in a success body does not put it in raw', async () => {
    const m = mockFetch([{ body: { id: 'pk_x', card_info: { name: `leak ${SECRET}` } } }])
    const pw = new PokeWallet({ apiKey: SECRET, fetch: m.fetch })
    const card = await pw.pokemon.card('pk_x')
    for (const text of everyRendering(card)) expect(text).not.toContain(SECRET)
  })

  it('a failing fetch whose error mentions the key (message, stack, cause) is scrubbed', async () => {
    const boom = Object.assign(new TypeError(`connect failed, headers: {"X-API-Key":"${SECRET}"}`), { code: 'ECONNRESET' })
    const http = new HttpClient({
      apiKey: SECRET,
      fetch: async () => {
        throw boom
      },
      sleep: noSleep,
    })
    const err = await fail(http.get('/health'))
    expect(err).toBeInstanceOf(NetworkError)
    for (const text of everyRendering(err)) expect(text).not.toContain(SECRET)
    expect(err.cause.code).toBe('ECONNRESET')
    expect(err.cause.stack).not.toContain(SECRET)
  })

  it('validation errors about the key never repeat it', () => {
    let thrown: unknown
    try {
      new HttpClient({ apiKey: 'FAKEKEY_without_prefix' })
    } catch (e) {
      thrown = e
    }
    expect(String((thrown as Error).message)).not.toContain('FAKEKEY')
  })
})
