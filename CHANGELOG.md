# Changelog

Changes to the TypeScript SDK, the Python SDK and the MCP server. The full notes of each version are on the [Releases page](https://github.com/pokewallet-lab/pokewallet-sdk/releases).

## 0.1.9

Requires the API release that serves `lang`; against an older API nothing is translated.

- Card languages (Pokémon): `search`, `card` and `set` take `lang` (`de es fr it pt ko zh-cn zh-tw th id`; `en` and `ja` are the default). Both SDKs check the value before sending, and refuse `lang` for One Piece and the ten games.
- New card fields: `language` / `language`, `languages` (what exists per language: `data`, `image`) and `image` with `path`, `language` and `languages` (`image.path` is the relative path of the image in the language asked). `imageUrl()` / `image_url()` accept that path and add only the host.
- The hosted MCP server: `search_cards`, `get_card` and `get_set` take an optional `lang` and show the language served, the languages available and the image path.
- OpenAPI: `lang` on `/search`, `/cards/{id}` and `/sets/{setCode}`, `card_info.language`, `card_info.languages`, `images.path` and `images.language`.
- Tests: fixtures for translated cards, unit tests, and contract and end-to-end checks that run with `POKEWALLET_LANG_LIVE=1`.

## 0.1.8

- One Piece: `card(id)` and search now report each card's set in `setId`, `setCode` and `setName` / `set_id`, `set_code` and `set_name` (before, only set listings had `setId` and `setCode`). The hosted MCP server shows the set on One Piece cards too.
- Tests: re-recorded One Piece search and card fixtures, unit tests for the set of an entry and contract checks on detail and search.

## 0.1.7

- One Piece: a card now reports its `product_type` (`card` or a sealed type) in `productType` / `product_type`, and set listings report `cardCount` / `sealedCount`. Each entry has its own id, so a Normal and a Foil entry of the same card no longer share one.
- Tests: re-recorded One Piece fixtures and contract checks for ids, product types and set counts.
- CI: the Python matrix runs on `ubuntu-24.04`, which still ships Python 3.9.

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
