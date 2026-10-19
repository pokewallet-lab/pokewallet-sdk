// The other games use the same interface. Run: node 05-games.mjs
import { PokeWallet } from '@pokewallet/sdk'

const pw = new PokeWallet()

const lotus = await pw.games.mtg.search('black lotus', { limit: 2 })
for (const c of lotus.items) console.log(`mtg: ${c.name} | ${c.setName} | $${c.tcgplayer?.prices[0]?.market ?? '?'}`)

// Game-specific fields (here Magic's power, toughness and type line) live in card.info.
const [emrakul] = (await pw.games.mtg.search('emrakul the exigent', { limit: 1 })).items
const card = await pw.games.mtg.card(emrakul.id)
console.log(`${card.name}: ${card.info.sub_type}, ${card.info.p}/${card.info.t}`)

const dragon = await pw.games.ygo.search('blue-eyes', { limit: 2 })
console.log('ygo:', dragon.items.map((c) => c.name).join(' | '))

const luffy = await pw.onepiece.search('luffy', { limit: 2 })
console.log('onepiece:', luffy.items.map((c) => `${c.name} (${c.rarity})`).join(' | '))

// Pick a game at runtime. Codes: mtg ygo cfv dbs fab dgm swu lor rft cpk
const code = 'lor'
const lorcana = await pw.game(code).search('elsa', { limit: 1 })
console.log(`${code}:`, lorcana.items[0]?.name)

// Public, no key needed: the list of games and the service status.
const games = await pw.listGames()
console.log(`${games.length} games:`, games.map((g) => `${g.code} (${g.name})`).join(', '))
console.log('API status:', (await pw.health()).status)
