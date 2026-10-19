import { describe, expect, it } from 'vitest'
import { PokeWallet } from '@pokewallet/sdk'
import { toolError } from '../../src/errors.js'
import { bearerKey } from '../../src/auth.js'
import { fixture, stubFetch, type Reply } from './helpers.js'

async function errorFor(reply: Reply, call: (pw: PokeWallet) => Promise<unknown>) {
  const pw = new PokeWallet({ apiKey: 'pk_test_not_a_real_key', fetch: stubFetch([reply]), maxRetries: 0 })
  try {
    await call(pw)
  } catch (e) {
    return toolError(e)
  }
  throw new Error('expected an error')
}

const text = (r: { content: Array<{ text: string }> }) => r.content[0]!.text

describe('error mapping', () => {
  it('passes the 403 trial message and link through verbatim', async () => {
    const r = await errorFor(
      { status: 403, body: { error: 'Trial not activated', message: 'Activate your free trial from the dashboard to access this feature.', redeem_url: 'https://pokewallet.io/dashboard' } },
      (pw) => pw.pokemon.trending(),
    )
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('Activate your free trial from the dashboard to access this feature.')
    expect(text(r)).toContain('https://pokewallet.io/dashboard')
  })

  it('passes the upgrade link and the original message', async () => {
    const up = await errorFor({ status: 403, body: { error: 'Ultra plan required', message: 'Your 7-day trial has expired.', upgrade_url: 'https://pokewallet.io/pricing' } }, (pw) => pw.games.mtg.trending())
    expect(text(up)).toContain('Your 7-day trial has expired.')
    expect(text(up)).toContain('https://pokewallet.io/pricing')
  })

  it('explains 401, 429, 503 and unknown sets without leaking internals', async () => {
    expect(text(await errorFor({ status: 401, body: { error: 'Authentication failed', message: 'Invalid API key' } }, (pw) => pw.pokemon.sets()))).toContain('rejected the key')
    const rl = await errorFor({ status: 429, body: { error: 'Rate limit exceeded', limits: { hourly: { limit: 100, used: 100, remaining: 0 } } } }, (pw) => pw.pokemon.sets())
    expect(text(rl)).toMatch(/hourly 0\/100/)
    expect(text(await errorFor({ status: 503, headers: { 'retry-after': '5' }, body: { error: 'busy', message: 'The database is busy right now.' } }, (pw) => pw.pokemon.sets()))).toContain('try again')
    const nf = await errorFor({ status: 404, body: { error: 'Set not found', message: 'No set', suggestions: [{ set_id: '1', name: 'Base' }] } }, (pw) => pw.games.mtg.set('zz'))
    expect(text(nf)).toContain('Suggestions')
  })

  it('returns an ambiguous set as data, not as an error', async () => {
    const pw = new PokeWallet({ apiKey: 'pk_test_not_a_real_key', fetch: stubFetch([{ body: fixture('pokemon-set-ambiguous') }]) })
    try {
      await pw.pokemon.set('PR')
    } catch (e) {
      const r = toolError(e)
      expect(r.isError).toBeUndefined()
      const data = JSON.parse(text(r))
      expect(data.ambiguous).toBe(true)
      expect(data.matches[0]).toMatchObject({ setId: '1938', code: 'PR', language: 'eng' })
      return
    }
    throw new Error('expected ambiguity')
  })
})

describe('bearerKey', () => {
  it('accepts Bearer pk_… only', () => {
    expect(bearerKey('Bearer pk_live_abc')).toBe('pk_live_abc')
    expect(bearerKey('bearer pk_live_abc')).toBe('pk_live_abc')
    for (const bad of [null, undefined, '', 'Bearer', 'Bearer abc', 'Bearer sk_live_abc', 'pk_live_abc', 'Basic pk_live_abc', 'Bearer pk_a b']) {
      expect(bearerKey(bad as string | null)).toBeNull()
    }
  })
})
