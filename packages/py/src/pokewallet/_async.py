"""Asynchronous transport and worlds (httpx.AsyncClient)."""
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Awaitable, Callable, List, Mapping, Optional

import httpx

from ._core import Core, clean_query
from ._dialect import CardDialect, OnePieceDialect, PokemonDialect
from .errors import NetworkError
from .types import (
    Card, CompletionValue, PriceHistory, SearchPage, SetPage, SetPrices,
    SetStatistics, SetSummary, TopCard, TrendingSet,
)


class AsyncTransport:
    def __init__(self, core: Core, client: httpx.AsyncClient, sleep: Callable[[float], Awaitable[Any]]) -> None:
        self._core = core
        self._client = client
        self._sleep = sleep

    async def get(self, path: str, query: Optional[Mapping[str, Any]] = None, *, public: bool = False, accept: Optional[Callable[[Any], bool]] = None) -> Any:
        self._core.require_key(public)
        attempt = 0
        while True:
            response: Optional[httpx.Response] = None
            failure: Optional[str] = None
            try:
                response = await self._client.get(
                    self._core.url(path), params=clean_query(query), headers=self._core.headers(), timeout=self._core.timeout
                )
            except httpx.HTTPError as exc:
                failure = self._core.network_error_message(exc)
            if failure is not None:
                # Raised outside the except block so no chained exception can carry the request headers.
                raise NetworkError(failure)
            assert response is not None
            body, err, retry_after = self._core.interpret(response.status_code, response.headers, response.text, path)
            if err is None:
                return body
            # Some non-2xx answers are data, not failures (an "unhealthy" report): return them as is, no retry.
            if accept is not None and accept(body):
                return body
            wait = self._core.wait_before_retry(err, retry_after, attempt)
            if wait is None:
                raise err
            attempt += 1
            await self._sleep(wait)


class AsyncWorld:
    """The one interface shared by Pokémon, One Piece and the ten games."""

    def __init__(self, transport: AsyncTransport, dialect: Any) -> None:
        self._t = transport
        self._d = dialect

    async def _get(self, req: Any) -> Any:
        return await self._t.get(req.path, req.query)

    async def search(self, q: str, *, page: Optional[int] = None, limit: Optional[int] = None) -> SearchPage:
        """One page of search results. ``q`` is 2-100 characters for the ten games."""
        return self._d.parse_search(await self._get(self._d.search(q, page, limit)))

    def search_all(self, q: str, *, limit: Optional[int] = None, max_items: Optional[int] = None) -> AsyncIterator[Card]:
        """Every result of a search, page after page."""
        return self._walk(lambda p: self.search(q, page=p, limit=limit), max_items)

    async def card(self, card_id: str) -> Card:
        """Card by id (``pk_…``, ``op_…``, ``<code>_…``, or a 64-hex CardMarket id)."""
        return self._d.parse_card(await self._get(self._d.card(card_id)))

    async def sets(self, *, language: Optional[str] = None) -> List[SetSummary]:
        """All sets of the world. The API does not paginate this list."""
        return self._d.parse_sets(await self._get(self._d.sets(language)))

    async def set(self, code: str, *, page: Optional[int] = None, limit: Optional[int] = None, language: Optional[str] = None) -> SetPage:
        """One page of a set's cards. Raises ``AmbiguousSetError`` when the code matches several sets."""
        return self._d.parse_set(await self._get(self._d.set(code, page, limit, language)))

    def set_cards(self, code: str, *, limit: Optional[int] = None, language: Optional[str] = None, max_items: Optional[int] = None) -> AsyncIterator[Card]:
        """Every card of a set, page after page."""
        return self._walk(lambda p: self.set(code, page=p, limit=limit, language=language), max_items)

    async def prices(self, code: str, *, source: Optional[str] = None) -> SetPrices:
        """Prices of every card in a set: hundreds to thousands of rows. Plan-gated."""
        return self._d.parse_prices(await self._get(self._d.prices(code, source)))

    async def statistics(self, code: str, *, variant: Optional[str] = None) -> SetStatistics:
        return self._d.parse_statistics(await self._get(self._d.statistics(code, variant)))

    async def completion_value(self, code: str) -> CompletionValue:
        return self._d.parse_completion_value(await self._get(self._d.completion_value(code)))

    async def trending(self, *, period: Optional[str] = None, limit: Optional[int] = None) -> List[TrendingSet]:
        return self._d.parse_trending(await self._get(self._d.trending(period, limit)))

    async def top_cards(self, *, metric: Optional[str] = None, source: Optional[str] = None, limit: Optional[int] = None) -> List[TopCard]:
        return self._d.parse_top_cards(await self._get(self._d.top_cards(metric, source, limit)))

    @staticmethod
    async def _walk(fetch: Callable[[int], Awaitable[Any]], max_items: Optional[int]) -> AsyncIterator[Card]:
        page, yielded = 1, 0
        while True:
            res = await fetch(page)
            for item in res.items:
                if max_items is not None and yielded >= max_items:
                    return
                yield item
                yielded += 1
            if not res.items or page >= res.total_pages:
                return
            page += 1


class AsyncPokemonWorld(AsyncWorld):
    def __init__(self, transport: AsyncTransport) -> None:
        super().__init__(transport, PokemonDialect())

    async def card(self, card_id: str, *, set_code: Optional[str] = None) -> Card:  # type: ignore[override]
        """Card by id, or by plain card number together with ``set_code``."""
        return self._d.parse_card(await self._get(self._d.card(card_id, set_code)))

    async def price_history(self, card_id: str) -> PriceHistory:
        """Price snapshots at 7/14/30/60/120 days, per finish (not a time series). Plan-gated."""
        return self._d.parse_price_history(await self._get(self._d.price_history(card_id)))


def build_async_worlds(transport: AsyncTransport):
    from .types import GAME_CODES

    games = {code: AsyncWorld(transport, CardDialect(f"/{code}", 2)) for code in GAME_CODES}
    return AsyncPokemonWorld(transport), AsyncWorld(transport, OnePieceDialect()), games


default_sleep = asyncio.sleep
