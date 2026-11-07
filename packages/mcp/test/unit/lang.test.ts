import { describe, expect, it } from 'vitest'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { buildServer } from '../../src/server.js'
import { cardDetail, cardSummary } from '../../src/shape.js'
import { PokeWallet } from '@pokewallet/sdk'
import { fixture, stubFetch } from './helpers.js'

const KEY = 'pk_test_not_a_real_key'

async function connect(replies: unknown[]) {
  const urls: string[] = []
  const inner = stubFetch(replies.map((body) => ({ body })))
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    urls.push(String(input))
    return inner(input, init)
  }) as typeof fetch
  const server = buildServer(KEY, { fetch: fetchImpl })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  const client = new Client({ name: 'unit', version: '0.0.0' })
  await client.connect(b)
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> }
    const text = res.content.map((c) => c.text).join('\n')
    return { isError: res.isError === true, text, json: () => JSON.parse(text) }
  }
  return { call, urls, client }
}

describe('lang on the tools', () => {
  it('search_cards, get_card and get_set pass lang to the API and show language, languages and the image path', async () => {
    const { call, urls } = await connect([fixture('pokemon-search-it'), fixture('pokemon-card-it'), fixture('pokemon-set-it')])
    const s = (await call('search_cards', { query: 'pinsir ethan', lang: 'IT', limit: 3 })).json()
    expect(urls[0]).toContain('lang=it')
    expect(s.results[0]).toMatchObject({ language: 'it', languages: expect.objectContaining({ en: 'data+image' }) })
    expect(s.results[0].imagePath).toMatch(/^\/images\/pk_[0-9a-f]+\?lang=it$/)

    const g = (await call('get_card', { id: 'pk_x', lang: 'it' })).json()
    expect(urls[1]).toContain('/cards/pk_x?lang=it')
    expect(g).toMatchObject({ name: 'Weedle', rarity: 'Comune', language: 'it', imageLanguage: 'it' })

    const set = (await call('get_set', { set: 'PLF', lang: 'it', limit: 3 })).json()
    expect(urls[2]).toContain('lang=it')
    expect(set.cards.every((c: any) => c.language && c.imagePath)).toBe(true)
  })

  it('a card without a translation says so: language en and the default image path', async () => {
    const { call } = await connect([fixture('pokemon-card-ko')])
    const g = (await call('get_card', { id: 'pk_x', lang: 'ko' })).json()
    expect(g.language).toBe('en')
    expect(g.imagePath).toMatch(/^\/images\/pk_[0-9a-f]+$/)
    expect(g.languages.ko).toBeUndefined()
  })

  it('without lang the output has the available languages but no language or image path', async () => {
    const { call } = await connect([fixture('pokemon-card')])
    const g = (await call('get_card', { id: 'pk_x' })).json()
    expect(g.languages).toMatchObject({ en: 'data+image', it: 'data+image' })
    expect(g).not.toHaveProperty('language')
    expect(g).not.toHaveProperty('imagePath')
  })

  it('an unknown language or a non-Pokémon game is a tool error that never reaches the API', async () => {
    const { call, urls } = await connect([{}])
    const bad = await call('search_cards', { query: 'pinsir', lang: 'xx' })
    expect(bad.isError).toBe(true)
    expect(bad.text).toContain('de, es, fr, it, pt, ko, zh-cn, zh-tw, th, id')
    const op = await call('search_cards', { query: 'luffy', game: 'onepiece', lang: 'it' })
    expect(op.isError).toBe(true)
    expect(op.text).toContain('only available for Pokémon')
    expect(urls).toHaveLength(0)
  })

  it('the tool descriptions explain the languages and that translations can be partial', async () => {
    const { client } = await connect([{}])
    const { tools } = await client.listTools()
    for (const name of ['search_cards', 'get_card', 'get_set']) {
      const t = tools.find((x) => x.name === name)!
      expect(t.description).toMatch(/partial/)
      expect(t.description).toContain('zh-cn')
      expect(JSON.stringify(t.inputSchema)).toContain('lang')
    }
  })

  it('no forbidden field leaves the shaped output', async () => {
    const pw = new PokeWallet({ apiKey: KEY, fetch: stubFetch([{ body: fixture('pokemon-card-it') }]) })
    const c = await pw.pokemon.card('pk_x', { lang: 'it' })
    for (const out of [cardSummary(c), cardDetail(c)]) expect(JSON.stringify(out)).not.toMatch(/product_id|encrypted_id|public_url|cardmarket_product_id/)
  })
})
