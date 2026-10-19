"""Entry points: :class:`PokeWallet` (sync) and :class:`AsyncPokeWallet`."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Callable, List, Optional

import httpx

from ._async import AsyncPokemonWorld, AsyncTransport, AsyncWorld, build_async_worlds
from ._async import default_sleep as _async_sleep
from ._core import MASK, Core, RateLimitInfo
from ._images import image_url
from ._normalize_misc import is_health_report, normalize_games, normalize_health
from .types import Game, Health
from ._sync import SyncPokemonWorld, SyncTransport, SyncWorld, build_sync_worlds
from ._sync import default_sleep as _sync_sleep


class _ClientBase:
    _core: Core

    @property
    def last_rate_limit(self) -> Optional[RateLimitInfo]:
        """Quota counters from the most recent answer, or None before the first call."""
        return self._core.last_rate_limit

    def image_url(self, card_id: str, *, size: Optional[str] = None, lang: Optional[str] = None, set: Optional[str] = None) -> str:  # noqa: A002
        """See :func:`pokewallet.image_url`: the URL still needs the API key header."""
        return image_url(card_id, base_url=self._core.base_url, size=size, lang=lang, set=set)

    def __repr__(self) -> str:
        key = MASK if self._core.credentials.present else None
        return f"{type(self).__name__}(base_url={self._core.base_url!r}, api_key={key!r})"

    __str__ = __repr__

    def __reduce__(self) -> Any:
        raise TypeError(f"{type(self).__name__} cannot be pickled or copied")


class PokeWallet(_ClientBase):
    """Synchronous client.

    >>> pw = PokeWallet()  # key from POKEWALLET_API_KEY (format pk_live_xxx)
    >>> pw.pokemon.search("charizard", limit=10)
    >>> pw.games.mtg.search("black lotus")
    """

    pokemon: SyncPokemonWorld
    onepiece: SyncWorld

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        user_agent: Optional[str] = None,
        max_retries: int = 2,
        retry_after_cap: float = 30.0,
        timeout: float = 30.0,
        transport: Optional[httpx.BaseTransport] = None,
        sleep: Optional[Callable[[float], Any]] = None,
    ) -> None:
        self._core = Core(api_key, base_url, user_agent, max_retries, retry_after_cap, timeout)
        self._http = httpx.Client(transport=transport)
        t = SyncTransport(self._core, self._http, sleep or _sync_sleep)
        self._t = t
        self.pokemon, self.onepiece, games = build_sync_worlds(t)
        self.games = SimpleNamespace(**games)
        self._games = games

    def game(self, code: str) -> SyncWorld:
        """The world for a game code known only at runtime."""
        return self._games[code]

    def health(self) -> Health:
        """Service status. Works without a key; the header is sent only when a key is set.

        The API answers 503 with a full report when a critical service is down. That report is
        information, not a failure: it is returned like a 200, with ``status == "unhealthy"`` and
        the failing ``checks``, and is never retried. A 503 without a report (for example an
        error page from the edge) still raises ``UnavailableError``.
        """
        return normalize_health(self._t.get("/health", public=True, accept=is_health_report))

    def list_games(self) -> List[Game]:
        """The ten games with their route maps. Works without a key."""
        return normalize_games(self._t.get("/games", public=True))

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "PokeWallet":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()


class AsyncPokeWallet(_ClientBase):
    """Asynchronous client with the same interface; every call is awaited, iterators are ``async for``."""

    pokemon: AsyncPokemonWorld
    onepiece: AsyncWorld

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        user_agent: Optional[str] = None,
        max_retries: int = 2,
        retry_after_cap: float = 30.0,
        timeout: float = 30.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        sleep: Optional[Callable[[float], Any]] = None,
    ) -> None:
        self._core = Core(api_key, base_url, user_agent, max_retries, retry_after_cap, timeout)
        self._http = httpx.AsyncClient(transport=transport)
        t = AsyncTransport(self._core, self._http, sleep or _async_sleep)
        self._t = t
        self.pokemon, self.onepiece, games = build_async_worlds(t)
        self.games = SimpleNamespace(**games)
        self._games = games

    def game(self, code: str) -> AsyncWorld:
        return self._games[code]

    async def health(self) -> Health:
        """Service status; an unhealthy 503 report is returned as data, see :meth:`PokeWallet.health`."""
        return normalize_health(await self._t.get("/health", public=True, accept=is_health_report))

    async def list_games(self) -> List[Game]:
        """The ten games with their route maps. Works without a key."""
        return normalize_games(await self._t.get("/games", public=True))

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncPokeWallet":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()
