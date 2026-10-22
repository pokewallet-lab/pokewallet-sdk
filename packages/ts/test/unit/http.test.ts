import { describe, expect, it } from 'vitest'
import { HttpClient, parseRetryAfter } from '../../src/http.js'
import {
  AmbiguousSetError,
  AuthError,
  BadRequestError,
  FeatureNotEnabledError,
  GameUnavailableError,
  NetworkError,
  NotFoundError,
  PlanRequiredError,
  RateLimitError,
  ServerError,
  UnavailableError,
  ValidationError,
} from '../../src/errors.js'
import { fail, mockFetch, noSleep, TEST_KEY, type Reply } from './helpers.js'

function client(replies: Reply[], extra: Record<string, unknown> = {}) {
  const m = mockFetch(replies)
  const sleeps: number[] = []
  const http = new HttpClient({
    apiKey: TEST_KEY,
    fetch: m.fetch,
    sleep: async (ms) => {
      sleeps.push(ms)
      await noSleep()
    },
    ...extra,
  })
  return { http, calls: m.calls, sleeps }
}

describe('request basics', () => {
  it('sends the key, an own User-Agent and skips empty query values', async () => {
    const { http, calls } = client([{ body: { ok: true } }])
    await http.get('/search', { q: 'pikachu', page: undefined, limit: 5 })
    expect(calls[0]!.url).toBe('https://api.pokewallet.io/search?q=pikachu&limit=5')
    expect(calls[0]!.headers['X-API-Key']).toBe(TEST_KEY)
    expect(calls[0]!.headers['User-Agent']).toMatch(/^pokewallet-sdk-ts\/\d+\.\d+\.\d+$/)
  })

  it('identifies the integration in X-PokeWallet-Client, with an override', async () => {
    const a = client([{ body: {} }])
    await a.http.get('/search')
    expect(a.calls[0]!.headers['X-PokeWallet-Client']).toMatch(/^pokewallet-sdk-ts\/\d+\.\d+\.\d+$/)
    const m = mockFetch([{ body: {} }])
    await new HttpClient({ apiKey: TEST_KEY, client: 'my-app/2', fetch: m.fetch }).get('/search')
    expect(m.calls[0]!.headers['X-PokeWallet-Client']).toBe('my-app/2')
  })

  it('rejects a malformed key at construction, but a missing key is allowed', () => {
    expect(() => new HttpClient({ apiKey: 'abc', fetch: mockFetch([{}]).fetch })).toThrow(/pk_/)
    expect(() => new HttpClient({ apiKey: '', fetch: mockFetch([{}]).fetch })).not.toThrow()
  })

  it('records the quota headers of the last answer', async () => {
    const { http } = client([
      {
        body: {},
        headers: {
          'x-ratelimit-limit-hour': '7000',
          'x-ratelimit-remaining-hour': '6990',
          'x-ratelimit-limit-day': '70000',
          'x-ratelimit-remaining-day': '69990',
        },
      },
    ])
    await http.get('/health')
    expect(http.lastRateLimit).toEqual({ limitHour: 7000, remainingHour: 6990, limitDay: 70000, remainingDay: 69990 })
  })

  it('wraps a failed fetch in NetworkError and does not retry it', async () => {
    const calls: number[] = []
    const http = new HttpClient({
      apiKey: TEST_KEY,
      fetch: async () => {
        calls.push(1)
        throw new TypeError('fetch failed')
      },
    })
    await expect(http.get('/health')).rejects.toBeInstanceOf(NetworkError)
    expect(calls).toHaveLength(1)
  })
})

describe('error mapping', () => {
  it('maps 401 to AuthError', async () => {
    const { http } = client([{ status: 401, body: { error: 'Missing API key', message: 'Please provide an API key' } }])
    await expect(http.get('/sets')).rejects.toBeInstanceOf(AuthError)
  })

  it('maps 403 trial, expired and no-access answers to the right classes with their links', async () => {
    const trial = client([{ status: 403, body: { error: 'Trial not activated', redeem_url: 'https://pokewallet.io/dashboard' } }])
    const e1 = await fail(trial.http.get('/sets/trending'))
    expect(e1).toBeInstanceOf(PlanRequiredError)
    expect(e1.redeemUrl).toBe('https://pokewallet.io/dashboard')

    const expired = client([{ status: 403, body: { error: 'Pro plan required', upgrade_url: 'https://pokewallet.io/pricing' } }])
    const e2 = await fail(expired.http.get('/sets/trending'))
    expect(e2.upgradeUrl).toBe('https://pokewallet.io/pricing')

    const noAccess = client([{ status: 403, body: { error: 'Feature not enabled', message: 'This account does not have access to this feature.', contact_url: 'https://pokewallet.io/contact' } }])
    const e3 = await fail(noAccess.http.get('/search'))
    expect(e3).toBeInstanceOf(FeatureNotEnabledError)
    expect(e3.contactUrl).toBe('https://pokewallet.io/contact')
  })

  it('maps 404 with suggestions, and a game-route "Endpoint not found" to GameUnavailableError', async () => {
    const nf = client([{ status: 404, body: { error: 'Set not found', suggestions: [{ set_id: '1' }], did_you_mean: '/x' } }])
    const e1 = await fail(nf.http.get('/mtg/sets/zzz'))
    expect(e1).toBeInstanceOf(NotFoundError)
    expect(e1).not.toBeInstanceOf(GameUnavailableError)
    expect(e1.suggestions).toHaveLength(1)

    const off = client([{ status: 404, body: { error: 'Endpoint not found' } }])
    await expect(off.http.get('/mtg/sets')).rejects.toBeInstanceOf(GameUnavailableError)
  })

  it('maps 400 and other 5xx without retrying', async () => {
    const bad = client([{ status: 400, body: { error: 'Query parameter required' } }])
    await expect(bad.http.get('/search')).rejects.toBeInstanceOf(BadRequestError)
    expect(bad.calls).toHaveLength(1)

    const boom = client([{ status: 500, body: { error: 'Internal server error' } }])
    await expect(boom.http.get('/search')).rejects.toBeInstanceOf(ServerError)
    expect(boom.calls).toHaveLength(1)
  })

  it('unifies 300 and 409 ambiguity into AmbiguousSetError with matches', async () => {
    const matches = [{ set_id: '1938', set_code: 'PR', name: 'Alternate Art Promos', language: 'eng', release_date: null }]
    const c300 = client([{ status: 300, body: { disambiguation: true, matches, total: 1 } }])
    const e1 = await fail(c300.http.get('/prices/PR'))
    expect(e1).toBeInstanceOf(AmbiguousSetError)
    expect(e1.matches[0]).toMatchObject({ setId: '1938', setCode: 'PR', language: 'eng' })

    const c409 = client([{ status: 409, body: { error: 'Ambiguous set code', message: 'm', matches } }])
    const e2 = await fail(c409.http.get('/sets/PR/statistics'))
    expect(e2).toBeInstanceOf(AmbiguousSetError)
    expect(e2.matches).toHaveLength(1)
  })
})

describe('retries', () => {
  const limits = (remaining: number) => ({
    hourly: { limit: 100, used: 100 - remaining, remaining },
    daily: { limit: 1000, used: 10, remaining: 990 },
  })

  it('retries a 429 that carries Retry-After within the cap, then succeeds', async () => {
    const { http, calls, sleeps } = client([
      { status: 429, headers: { 'retry-after': '3' }, body: { error: 'Rate limit exceeded', limits: limits(5) } },
      { body: { ok: 1 } },
    ])
    await expect(http.get('/search')).resolves.toEqual({ ok: 1 })
    expect(calls).toHaveLength(2)
    expect(sleeps).toEqual([3000])
  })

  it('never guesses: a 429 without Retry-After throws at once with the limits attached', async () => {
    const { http, calls, sleeps } = client([{ status: 429, body: { error: 'Rate limit exceeded', limits: limits(0) } }])
    const err = await fail(http.get('/search'))
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.limits.hourly).toEqual({ limit: 100, used: 100, remaining: 0 })
    expect(err.retryAfter).toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(sleeps).toEqual([])
  })

  it('does not retry a 429 whose window is exhausted even with Retry-After', async () => {
    const { http, calls } = client([
      { status: 429, headers: { 'retry-after': '2' }, body: { error: 'Rate limit exceeded', limits: limits(0) } },
    ])
    await expect(http.get('/search')).rejects.toBeInstanceOf(RateLimitError)
    expect(calls).toHaveLength(1)
  })

  it('throws when Retry-After is above the cap', async () => {
    const { http, calls } = client([
      { status: 429, headers: { 'retry-after': '120' }, body: { error: 'Rate limit exceeded', limits: limits(5) } },
    ])
    const err = await fail(http.get('/search'))
    expect(err.retryAfter).toBe(120)
    expect(calls).toHaveLength(1)
    const custom = client(
      [{ status: 429, headers: { 'retry-after': '120' }, body: { limits: limits(5) } }, { body: {} }],
      { retryAfterCapSeconds: 300 },
    )
    await custom.http.get('/search')
    expect(custom.calls).toHaveLength(2)
  })

  it('retries a 503 twice honoring Retry-After, then throws UnavailableError', async () => {
    const { http, calls, sleeps } = client([{ status: 503, headers: { 'retry-after': '5' }, body: { error: 'Temporarily unavailable' } }])
    const err = await fail(http.get('/search'))
    expect(err).toBeInstanceOf(UnavailableError)
    expect(err.retryAfter).toBe(5)
    expect(calls).toHaveLength(3)
    expect(sleeps).toEqual([5000, 5000])
  })

  it('recovers when the second 503 attempt succeeds', async () => {
    const { http, calls } = client([{ status: 503, headers: { 'retry-after': '5' }, body: {} }, { body: { ok: 1 } }])
    await expect(http.get('/search')).resolves.toEqual({ ok: 1 })
    expect(calls).toHaveLength(2)
  })

  it('does not wait out a 503 that asks for an hour', async () => {
    const { http, calls } = client([{ status: 503, headers: { 'retry-after': '3600' }, body: { error: 'Not available yet' } }])
    const err = await fail(http.get('/mtg/analytics/top-cards'))
    expect(err).toBeInstanceOf(UnavailableError)
    expect(err.retryAfter).toBe(3600)
    expect(calls).toHaveLength(1)
  })

  it('honors maxRetries', async () => {
    const { http, calls } = client([{ status: 503, headers: { 'retry-after': '1' }, body: {} }], { maxRetries: 0 })
    await expect(http.get('/search')).rejects.toBeInstanceOf(UnavailableError)
    expect(calls).toHaveLength(1)
  })
})

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates, ignores junk', () => {
    expect(parseRetryAfter('5')).toBe(5)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
    const now = Date.parse('2026-10-02T10:00:00Z')
    expect(parseRetryAfter('Fri, 02 Oct 2026 10:00:10 GMT', now)).toBe(10)
  })
})
