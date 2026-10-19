// Walk every page without handling page numbers. Run: node 02-pagination.mjs
import { PokeWallet } from '@pokewallet/sdk'

const pw = new PokeWallet()

// One Piece and the ten games paginate differently on the wire; here they look the same.
let n = 0
for await (const card of pw.pokemon.setCards('PLF', { limit: 50, maxItems: 120 })) {
  n++
  if (n % 40 === 0) console.log(`  ...${n} cards, latest: ${card.name}`)
}
console.log(`Walked ${n} cards of Plasma Freeze`)

let hits = 0
for await (const card of pw.onepiece.searchAll('luffy', { limit: 20, maxItems: 45 })) hits++
console.log(`Walked ${hits} One Piece search results`)

// Manual paging works too.
const page2 = await pw.pokemon.search('pikachu', { page: 2, limit: 10 })
console.log(`Page ${page2.page}/${page2.totalPages}: ${page2.items.map((c) => c.name).slice(0, 3).join(', ')}…`)
