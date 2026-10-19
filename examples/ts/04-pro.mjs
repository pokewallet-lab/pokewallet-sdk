// Pro endpoints (Pro plan or the 7-day trial; Ultra for the ten games). Run: node 04-pro.mjs
import { PlanRequiredError, PokeWallet } from '@pokewallet/sdk'

const pw = new PokeWallet()

try {
  const stats = await pw.pokemon.statistics('PLF')
  console.log(`${stats.set.name}: average $${stats.tcgplayer?.avg}, most expensive ${stats.tcgplayer?.mostExpensive?.name} ($${stats.tcgplayer?.mostExpensive?.price})`)

  const cost = await pw.pokemon.completionValue('PLF')
  console.log(`Completing the set costs about $${cost.tcgplayer?.market} (TCGPlayer market)`)

  const top = await pw.pokemon.topCards({ limit: 3 })
  console.log('Most expensive:', top.map((t) => `${t.name} $${t.price}`).join(' | '))

  const growth = await pw.pokemon.topCards({ metric: 'growth', source: 'cm', limit: 3 })
  console.log('Fastest growing:', growth.map((t) => `${t.name} ${t.change7d}`).join(' | '))

  const [hot] = await pw.pokemon.trending({ limit: 1 })
  console.log(`Trending set: ${hot?.set.name} ${hot?.change}`)

  const [first] = (await pw.pokemon.search('charizard', { limit: 1 })).items
  const history = await pw.pokemon.priceHistory(first.id)
  const [finish, point] = Object.entries(history.tcgplayer ?? history.cardmarket ?? {})[0] ?? []
  console.log(`${history.name} (${finish}): now ${JSON.stringify(point?.current)}, 30 days ago ${point?.price[30]}`)
} catch (e) {
  if (e instanceof PlanRequiredError) {
    console.log(`${e.message}\nGet access: ${e.redeemUrl ?? e.upgradeUrl}`)
  } else throw e
}
