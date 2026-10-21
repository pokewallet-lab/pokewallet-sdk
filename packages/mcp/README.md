# @pokewallet/mcp

Stateless remote [MCP](https://modelcontextprotocol.io) server for the PokeWallet API, built on a Cloudflare Worker with `createMcpHandler` (Streamable HTTP at `/mcp`). No Durable Objects, no KV, no server-side key.

**Auth (mode A):** each request carries `Authorization: Bearer pk_…`, the caller's own PokeWallet key. The Worker answers 401 for anything that is not a Bearer `pk_` token before calling upstream, then forwards the key through `@pokewallet/sdk` with `User-Agent: pokewallet-mcp/<version>`. Plan limits and quota stay the caller's own. The key is never logged or echoed.

Tools (all read-only, each call costs one request of the caller's quota): `list_games`, `search_cards` (max 10 results), `get_card`, `list_sets`, `get_set` (an ambiguous set returns its alternatives), `get_price_history` (Pokémon), `top_cards`, `trending_sets`, `set_statistics` (optional `variant`: `normal` or `foil`), `set_completion_value`. `trending_sets` covers the last 7 days, the only period. A `game` parameter selects `pokemon` (default), `onepiece` or one of the ten game codes. Whole-set price dumps and images are deliberately not exposed.

```sh
npm install
npm run typecheck
npm test                  # unit tests, no network
npm run test:e2e          # starts `wrangler dev` locally; live tests need POKEWALLET_API_KEY in the environment
npm run dev               # local server at http://127.0.0.1:8787/mcp
```

The hosted server runs at `https://mcp.pokewallet.io/mcp` (account and custom domain are in `wrangler.toml`). Nothing deploys from this repo by itself: a maintainer logged in to that Cloudflare account deploys with `npm run build:sdk && npx wrangler deploy`.
