# pokewallet

> Install with `pip install pokewallet`. The [root README](../../README.md#2-install) has the quickstart, the full method table and the MCP server.

Official Python SDK for the [PokeWallet API](https://pokewallet.io): Pokémon, One Piece and ten more card games, with TCGPlayer and CardMarket prices. Python 3.9+, sync and async clients, `httpx` is the only dependency.

```python
from pokewallet import PokeWallet

# Key format: pk_live_xxx. Keep it in the environment, never in source control.
pw = PokeWallet()  # reads POKEWALLET_API_KEY, or pass api_key=...

page = pw.pokemon.search("charizard", limit=10)
op01 = pw.onepiece.set("OP01")
for card in pw.games.mtg.set_cards("FRA"):
    print(card.name)
```

Async:

```python
from pokewallet import AsyncPokeWallet

async with AsyncPokeWallet() as pw:
    page = await pw.pokemon.search("pikachu")
    async for card in pw.games.mtg.search_all("lotus"):
        ...
```

Pokémon, One Piece and the ten games (`pw.games.mtg`, `pw.games.ygo`, ... or `pw.game(code)`) share one interface: `search`, `search_all`, `card`, `sets`, `set`, `set_cards`, `prices`, `statistics`, `completion_value`, `trending`, `top_cards`. Pokémon adds `price_history`.

- **Typed errors:** `AuthError`, `PlanRequiredError` (`redeem_url` / `upgrade_url`), `FeatureNotEnabledError`, `RateLimitError`, `AmbiguousSetError` (`matches`), `NotFoundError`, `UnavailableError`, `ValidationError`.
- **Retries:** only on 429 (when `Retry-After` is present, within `retry_after_cap`, default 30 s, and no quota window is exhausted) and on 503 (up to `max_retries`, default 2). Never on other 4xx or 5xx.
- **Validation:** `limit` and `page` are checked before the request is sent.
- **Normalization:** prices are `float | None`; set identifiers are exposed as `set_id` / `set_code` / `set_name` (One Piece too, in card detail and search); every object keeps the server value in `raw`; a card has `product_type` and a set listing has `card_count` / `sealed_count`. Ambiguous set answers (200, 300 and 409 on the wire) all raise `AmbiguousSetError`.
- **Key safety:** the key is held in a closure and shown as `pk_***` by `repr`, `str` and errors; clients cannot be pickled.
- **Images:** `image_url(card_id)` only builds the URL; the image routes need the `X-API-Key` header. A 404 `Image not found` means the source has no image (do not retry it in the same run); 5xx answers are temporary (retry with backoff); on 429 wait for `Retry-After`.
- **CardMarket-only sets** (negative `set_id`): each `prices` row is one CardMarket product, and its `cardmarket` block is the `normal` price. A `tcgplayer` block there is an extra link with no finish and must not be compared or added to it; for European prices by finish use `card(id)`. An ambiguous `set_code` on `prices` is resolved with the numeric `set_id`.

The client can be created without a key: `health()` and `list_games()` are public and work without one (the `X-API-Key` header is sent only when a key is set); every other call raises `ValidationError` before any request is made.

Every request carries `User-Agent: pokewallet-sdk-py/<version>` and `X-PokeWallet-Client: pokewallet-sdk-py/<version>`; the `client` argument replaces the latter with your app name.

Attribution: if you show data obtained through the PokeWallet API, SDKs or MCP server to other people, credit PokéWallet with visible text "Data by PokéWallet" (or "Powered by PokéWallet") linking to <https://pokewallet.io>; private use needs no attribution. See the [Terms of Use](https://pokewallet.io/terms-conditions). This concerns the data and the service; the MIT license of the code is separate.
