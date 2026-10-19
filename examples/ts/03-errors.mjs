// Typed errors. Run: node 03-errors.mjs
import {
  AmbiguousSetError,
  NotFoundError,
  PlanRequiredError,
  PokeWallet,
  RateLimitError,
  ValidationError,
} from '@pokewallet/sdk'

const pw = new PokeWallet()

// 1. A set code that exists in several languages: pick one of the matches.
try {
  await pw.pokemon.set('PR')
} catch (e) {
  if (!(e instanceof AmbiguousSetError)) throw e
  console.log(`"PR" is ambiguous (${e.matches.length} sets), for example:`)
  for (const m of e.matches.slice(0, 3)) console.log(`  setId ${m.setId}: ${m.name} [${m.language}]`)
  const page = await pw.pokemon.set(e.matches[0].setId, { limit: 2 })
  console.log(`Retried with setId ${e.matches[0].setId}: ${page.items.length} cards`)
}

// 2. Plan-gated data: the error carries the link to fix it.
try {
  const trending = await pw.pokemon.trending({ limit: 3 })
  console.log(`\nTrending: ${trending.map((t) => t.set.name).join(', ')}`)
} catch (e) {
  if (e instanceof PlanRequiredError) console.log(`\n${e.message}\nActivate the trial: ${e.redeemUrl ?? e.upgradeUrl}`)
  else throw e
}

// 3. Unknown things.
try {
  await pw.pokemon.set('NOSUCHSET')
} catch (e) {
  if (e instanceof NotFoundError) console.log(`\nNot found: ${e.message}`)
  else throw e
}

// 4. Bad arguments never reach the network.
try {
  await pw.pokemon.search('pikachu', { limit: 500 })
} catch (e) {
  if (e instanceof ValidationError) console.log(`\nRejected locally: ${e.message}`)
  else throw e
}

// 5. Rate limits: handle them where you call in bulk.
try {
  await pw.pokemon.sets()
} catch (e) {
  if (e instanceof RateLimitError) console.log('Out of quota:', e.limits)
  else throw e
}
console.log(`\nQuota left this hour: ${pw.lastRateLimit?.remainingHour}`)
