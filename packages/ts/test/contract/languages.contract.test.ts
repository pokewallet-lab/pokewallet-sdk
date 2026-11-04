import { beforeAll, describe, expect, it } from 'vitest'
import { PokeWallet, ValidationError, type Card } from '../../src/index.js'
import { BASE_URL, fail, HAS_KEY, HAS_LANG, internalFields, liveClient } from './setup.js'

// Needs an API that serves `lang`: set POKEWALLET_LANG_LIVE (and POKEWALLET_BASE_URL for a non-production instance).
describe.skipIf(!HAS_KEY || !HAS_LANG)('contract: card languages (live API)', () => {
  let pw: PokeWallet
  let it_: Card

  beforeAll(async () => {
    pw = liveClient()
    it_ = (await pw.pokemon.search('pinsir ethan', { lang: 'it', limit: 3 })).items.find((c) => c.language === 'it')!
  })

  it('a translated card: language, languages and an image path in the same language', async () => {
    expect(it_).toBeDefined()
    const c = await pw.pokemon.card(it_.id, { lang: 'IT' })
    expect(c.language).toBe('it')
    expect(c.languages.en).toEqual(['data', 'image'])
    expect(c.languages.it).toContain('data')
    expect(c.image).toMatchObject({ language: 'it' })
    expect(c.image!.path).toBe(`/images/${c.id}?lang=it`)
    expect(c.name).not.toBe((await pw.pokemon.card(c.id)).name)
    expect(pw.imageUrl(c.image!.path!)).toMatch(/\/images\/pk_[0-9a-f]+\?lang=it$/)
  })

  it('without lang: languages is there, language and the image path are not', async () => {
    const c = await pw.pokemon.card(it_.id)
    expect(c.language).toBeNull()
    expect(c.languages.en).toEqual(['data', 'image'])
    expect(c.image!.path).toBeNull()
  })

  it('a language the card does not have falls back to English with the default image path', async () => {
    const c = await pw.pokemon.card(it_.id, { lang: 'ko' })
    expect(c.language).toBe('en')
    expect(c.image).toMatchObject({ language: 'en', path: `/images/${c.id}` })
  })

  it('en and ja answer like no lang at all', async () => {
    const plain = await pw.pokemon.card(it_.id)
    for (const lang of ['en', 'ja']) expect((await pw.pokemon.card(it_.id, { lang })).raw).toEqual(plain.raw)
  })

  it('search and set listings translate every card', async () => {
    const page = await pw.pokemon.set('DRI', { lang: 'it', limit: 5 })
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((c) => c.language !== null && c.image!.path)).toBe(true)
    expect(page.items.some((c) => c.language === 'it')).toBe(true)
  })

  it('the API itself refuses an unknown language with the list of valid ones', async () => {
    // The SDK checks first, so ask the wire directly.
    const res = await fetch(`${BASE_URL ?? 'https://api.pokewallet.io'}/search?q=pinsir&lang=xx`, { headers: { 'X-API-Key': process.env.POKEWALLET_API_KEY! } })
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('lang must be one of')
    expect(await fail(pw.pokemon.search('pinsir', { lang: 'xx' }))).toBeInstanceOf(ValidationError)
  })

  it('One Piece and the games take no lang and carry no languages', async () => {
    expect(await fail(pw.onepiece.search('luffy', { lang: 'it' }))).toBeInstanceOf(ValidationError)
    const op = (await pw.onepiece.search('luffy', { limit: 1 })).items[0]!
    expect(op.languages).toEqual({})
    const mtg = (await pw.games.mtg.search('black lotus', { limit: 1 })).items[0]!
    expect(mtg.languages).toEqual({})
  })

  it('no internal field leaves the API with lang', async () => {
    const page = await pw.pokemon.search('pinsir ethan', { lang: 'it', limit: 3 })
    const card = await pw.pokemon.card(it_.id, { lang: 'it' })
    expect(internalFields([page.items.map((c) => c.raw), card.raw])).toEqual([])
  })
})
