# @pokewallet/sdk

> Install with `npm install @pokewallet/sdk`. The [root README](../../README.md#2-install) has the quickstart, the full method table and the MCP server.

Official TypeScript SDK for the [PokeWallet API](https://pokewallet.io): Pokémon, One Piece and ten more card games, with TCGPlayer and CardMarket prices. Zero runtime dependencies, ESM and CJS, Node 18+ (also Workers and browsers: it only needs `fetch`).

```ts
import { PokeWallet } from '@pokewallet/sdk'

// Key format: pk_live_xxx. Keep it in the environment, never in source control.
const pw = new PokeWallet({ apiKey: process.env.POKEWALLET_API_KEY })

const page = await pw.pokemon.search('charizard', { limit: 10 })
const op01 = await pw.onepiece.set('OP01')
for await (const card of pw.games.mtg.setCards('FRA')) console.log(card.name)
```

Pokémon, One Piece and the ten games (`pw.games.mtg`, `pw.games.ygo`, ...) share one interface: `search`, `searchAll`, `card`, `sets`, `set`, `setCards`, `prices`, `statistics`, `completionValue`, `trending`, `topCards`. Pokémon adds `priceHistory`.

- **Typed errors:** `AuthError`, `PlanRequiredError` (`redeemUrl` / `upgradeUrl`), `FeatureNotEnabledError`, `RateLimitError` (`limits`), `AmbiguousSetError` (`matches`), `NotFoundError`, `UnavailableError`, `ValidationError`.
- **Retries:** only on 429 (when `Retry-After` is present, within `retryAfterCapSeconds`, default 30, and no quota window is exhausted) and on 503 (up to `maxRetries`, default 2). Never on other 4xx or 5xx. `fetch`, `timeoutMs` and `sleep` are injectable.
- **Validation:** `limit` and `page` are checked before the request is sent.
- **Normalization:** prices are `number | null`; set identifiers are exposed as `setId` / `setCode` / `setName` (One Piece too, in card detail and search); every object keeps the server value in `raw`; a card has `productType` and a set listing has `cardCount` / `sealedCount`. Ambiguous set answers (200, 300 and 409 on the wire) all raise `AmbiguousSetError`.
- **Key safety:** the key is held in a private field and shown as `pk_***` by `JSON.stringify`, `util.inspect` and errors.
- **Images:** `imageUrl(id)` only builds the URL. The image routes need the `X-API-Key` header, so the URL cannot be used directly in an `<img>` tag. A 404 `Image not found` means the source has no image (do not retry it in the same run); 5xx answers are temporary (retry with backoff); on 429 wait for `Retry-After`.
- **CardMarket-only sets** (negative `set_id`): each `prices` row is one CardMarket product, and its `cardmarket` block is the `normal` price. A `tcgplayer` block there is an extra link with no finish and must not be compared or added to it; for European prices by finish use `card(id)`. An ambiguous `set_code` on `prices` is resolved with the numeric `set_id`.

The key is read from the `apiKey` option or the `POKEWALLET_API_KEY` environment variable. The client can be created without one: `health()` and `listGames()` are public and work without a key (the `X-API-Key` header is sent only when a key is set); every other call throws `ValidationError` before any request is made. Every request carries `User-Agent: pokewallet-sdk-ts/<version>` and `X-PokeWallet-Client: pokewallet-sdk-ts/<version>`; the `client` option replaces the latter with your app name (browsers cannot set `User-Agent`, so the header is how a browser app identifies itself).

Attribution: if you show data obtained through the PokeWallet API, SDKs or MCP server to other people, credit PokéWallet with visible text "Data by PokéWallet" (or "Powered by PokéWallet") linking to <https://pokewallet.io>; private use needs no attribution. See the [Terms of Use](https://pokewallet.io/terms-conditions). This concerns the data and the service; the MIT license of the code is separate.
