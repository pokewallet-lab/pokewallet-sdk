# Changelog

Changes to the TypeScript SDK, the Python SDK and the MCP server. The full notes of each version are on the [Releases page](https://github.com/pokewallet-lab/pokewallet-sdk/releases).

## 0.1.6

- Documentation: Trainer Gallery and Galarian Gallery sets (`CRZ:GG`, `SWSH09:TG`, `SWSH10:TG`, `SWSH11: TG`, `SWSH12: TG`) now carry CardMarket prices on every card, in `prices`, card detail, set listings and search. Only the values change; there are no new fields.
- Documentation: how `prices` reads for CardMarket-only sets (negative `set_id`), and the outcomes of the image routes (404, 5xx, 429).
- Tests: contract checks for CardMarket prices on the gallery sets.

## 0.1.5

- Both SDKs send an `X-PokeWallet-Client` header with every request; the `client` option replaces its value.
- The hosted MCP server passes the name of the calling MCP client on in the same header.
- The npm publish step of the release workflow no longer sets an empty token.

## 0.1.4

- Published on PyPI only (the npm publish failed); its changes are in 0.1.5.

## 0.1.3

- Unified Pro endpoints (trending, top cards, set statistics, set completion and prices) in every game.
- Pokémon listings and search use the same set identifiers; documented `variants`, `truncated` and One Piece CardMarket prices.
- MCP server aligned with the SDKs.
