import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

// The live key only ever comes from the environment of THIS process. It is sent as a Bearer
// header to the local Worker and is never passed to the wrangler process or written anywhere.
const KEY = process.env.POKEWALLET_API_KEY
const live = describe.skipIf(!KEY)

let worker: ChildProcess
let base: string

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

async function waitReady(url: string): Promise<void> {
  const deadline = Date.now() + 80_000
  for (;;) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('wrangler dev did not become ready')
    await new Promise((r) => setTimeout(r, 500))
  }
}

beforeAll(async () => {
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  const { POKEWALLET_API_KEY: _omit, ...env } = process.env
  worker = spawn('npx', ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--log-level', 'error'], {
    env: { ...env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  await waitReady(`${base}/`)
})

afterAll(async () => {
  worker?.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 300))
  if (worker && worker.exitCode === null) worker.kill('SIGKILL')
})

const rpc = (headers: Record<string, string>, body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' }) =>
  fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  })

describe('authentication gate (no key needed)', () => {
  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { authorization: 'Basic pk_live_x' }],
    ['a Bearer token without the pk_ prefix', { authorization: 'Bearer sk_live_x' }],
    ['an empty Bearer token', { authorization: 'Bearer ' }],
  ])('answers 401 for %s', async (_n, headers) => {
    const res = await rpc(headers)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/)
    expect(JSON.stringify(await res.json())).toMatch(/pk_/)
  })

  it('does not demand a key for the CORS preflight (the handler still guards foreign browser origins) and 404s other paths', async () => {
    const pre = await fetch(`${base}/mcp`, { method: 'OPTIONS', headers: { origin: 'https://example.com', 'access-control-request-method': 'POST' } })
    expect(pre.status).not.toBe(401)
    expect((await fetch(`${base}/other`)).status).toBe(404)
  })
})

async function connect(key: string): Promise<Client> {
  const client = new Client({ name: 'pokewallet-e2e', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${key}` } } }))
  return client
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
  const text = res.content.map((c) => c.text).join('\n')
  expect(text).not.toContain(KEY ?? '\u0000never')
  return { isError: res.isError === true, text, json: () => JSON.parse(text) }
}

live('MCP over Streamable HTTP against the production API', () => {
  let client: Client
  let pokemonId: string

  beforeAll(async () => {
    client = await connect(KEY!)
  })
  afterAll(async () => {
    await client?.close()
  })

  it('lists exactly the ten read-only tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_card', 'get_price_history', 'get_set', 'list_games', 'list_sets', 'search_cards', 'set_completion_value', 'set_statistics', 'top_cards', 'trending_sets'].sort(),
    )
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true)
      expect(t.description).toMatch(/quota/i)
    }
  })

  it('list_games and search_cards (limit capped at 10, prices trimmed)', async () => {
    const games = (await call(client, 'list_games')).json()
    expect(games.games.map((g: { game: string }) => g.game)).toEqual(expect.arrayContaining(['pokemon', 'onepiece', 'mtg', 'cpk']))

    const r = await call(client, 'search_cards', { query: 'charizard', limit: 3 })
    const data = r.json()
    expect(data.results).toHaveLength(3)
    pokemonId = data.results[0].id
    expect(pokemonId).toMatch(/^pk_/)
    expect(r.text).not.toMatch(/null|raw/i)
    expect(Object.keys(data.results[0])).toEqual(expect.arrayContaining(['id', 'name', 'set']))
    expect(r.text.length).toBeLessThan(3000)

    await expect(client.callTool({ name: 'search_cards', arguments: { query: 'charizard', limit: 11 } }).then((x) => (x as { isError?: boolean }).isError ?? false, () => true)).resolves.toBe(true)
  })

  it('get_card, other worlds, list_sets filtering', async () => {
    const card = (await call(client, 'get_card', { id: pokemonId })).json()
    expect(card.id).toBe(pokemonId)
    expect(card.links.tcgplayer).toMatch(/^https:\/\//)

    const op = (await call(client, 'search_cards', { query: 'luffy', game: 'onepiece', limit: 2 })).json()
    expect(op.results[0].id).toMatch(/^op_/)
    const mtg = (await call(client, 'search_cards', { query: 'black lotus', game: 'mtg', limit: 2 })).json()
    expect(mtg.results.length).toBeGreaterThan(0)

    const sets = (await call(client, 'list_sets', { name: 'plasma', limit: 5 })).json()
    expect(sets.matching).toBeGreaterThan(0)
    expect(sets.sets.length).toBeLessThanOrEqual(5)
    expect(sets.sets.every((s: { name: string }) => /plasma/i.test(s.name))).toBe(true)
  })

  it('get_set pages a set; an ambiguous code returns alternatives, not an error', async () => {
    const page = (await call(client, 'get_set', { set: 'PLF', limit: 5 })).json()
    expect(page.cards).toHaveLength(5)
    expect(page.set.code).toBe('PLF')
    expect(JSON.stringify(page.cards[0])).not.toMatch(/tcgplayerUsd|cardmarketEur/)

    const amb = await call(client, 'get_set', { set: 'PR' })
    expect(amb.isError).toBe(false)
    expect(amb.json()).toMatchObject({ ambiguous: true })
    expect(amb.json().matches.length).toBeGreaterThan(1)

    const stat = await call(client, 'set_statistics', { set: 'PR' })
    expect(stat.isError).toBe(false)
    expect(stat.json().ambiguous).toBe(true)
  })

  it('Pro tools: statistics, completion value, history, rankings', async () => {
    expect((await call(client, 'set_statistics', { set: 'PLF' })).json().tcgplayerUsd.average).toBeTypeOf('number')
    expect((await call(client, 'set_completion_value', { set: 'PLF' })).json().tcgplayerUsd.market).toBeTypeOf('number')
    expect(Object.keys((await call(client, 'get_price_history', { id: pokemonId })).json())).toContain('id')
    const top = (await call(client, 'top_cards', { limit: 3 })).json()
    expect(top.cards).toHaveLength(3)
    expect(top.currency).toBe('USD')
    const growth = (await call(client, 'top_cards', { game: 'onepiece', metric: 'growth', source: 'cm', limit: 3 })).json()
    expect(growth.currency).toBe('EUR')
    expect((await call(client, 'trending_sets', { limit: 3 })).json().sets.length).toBeGreaterThan(0)
  })

  it('maps API errors to tool errors: unknown set, and a pk_ key the API rejects', async () => {
    const nf = await call(client, 'get_set', { set: 'ZZZZNOSUCHSET' })
    expect(nf.isError).toBe(true)
    const bad = await connect('pk_this_key_does_not_exist_0000')
    try {
      const r = await call(bad, 'list_sets', { name: 'x' })
      expect(r.isError).toBe(true)
      expect(r.text).toMatch(/rejected|key|Authentication/i)
    } finally {
      await bad.close()
    }
  })
})
