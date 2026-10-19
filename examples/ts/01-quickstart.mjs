// First search, one card with prices, one set. Run: node 01-quickstart.mjs
import { PokeWallet } from '@pokewallet/sdk'

const pw = new PokeWallet() // reads POKEWALLET_API_KEY

const results = await pw.pokemon.search('charizard', { limit: 3 })
console.log(`${results.total} cards match, showing ${results.items.length}`)
for (const card of results.items) {
  const usd = card.tcgplayer?.prices[0]?.market // TCGPlayer market price, USD
  const eur = card.cardmarket?.prices[0]?.trend // CardMarket trend, EUR
  console.log(`- ${card.name} | ${card.setName} #${card.number} | $${usd ?? '?'} / €${eur ?? '?'} | ${card.id.slice(0, 12)}…`)
}

// Details of one card, by the id a search returned.
const card = await pw.pokemon.card(results.items[0].id)
console.log(`\n${card.name}: rarity ${card.rarity}`)
for (const p of card.tcgplayer?.prices ?? []) console.log(`  ${p.variant}: market $${p.market}, low $${p.low}, high $${p.high}`)

// A set, by code.
const set = await pw.pokemon.set('PLF', { limit: 5 })
console.log(`\n${set.set.name} (${set.set.code}): ${set.total} cards, page ${set.page} of ${set.totalPages}`)
for (const c of set.items) console.log(`  ${c.number} ${c.name}`)

console.log(`\nRequests left this hour: ${pw.lastRateLimit?.remainingHour} of ${pw.lastRateLimit?.limitHour}`)
