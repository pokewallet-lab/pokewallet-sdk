"""Public, normalized models. Every object keeps the unmodified server value in ``raw``.

Prices are ``float | None``; the API sometimes sends numeric strings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

GAME_CODES = ("mtg", "ygo", "cfv", "dbs", "fab", "dgm", "swu", "lor", "rft", "cpk")


@dataclass
class TcgPrice:
    #: Finish (``Normal``, ``Holofoil``, ``Foil``...). None for rows that have no finish.
    variant: Optional[str]
    low: Optional[float]
    mid: Optional[float]
    high: Optional[float]
    market: Optional[float]
    direct_low: Optional[float]
    updated_at: Optional[str]
    raw: Any = None


@dataclass
class CardmarketPrice:
    variant: Optional[str]
    avg: Optional[float]
    low: Optional[float]
    trend: Optional[float]
    avg1: Optional[float]
    avg7: Optional[float]
    avg30: Optional[float]
    updated_at: Optional[str]
    raw: Any = None


@dataclass
class TcgplayerBlock:
    url: Optional[str]
    prices: List[TcgPrice]


@dataclass
class CardmarketBlock:
    product_name: Optional[str]
    url: Optional[str]
    prices: List[CardmarketPrice]


@dataclass
class Card:
    """A card.

    ``set_id`` is the numeric id (possibly negative), ``set_code`` the short code. Source:
    ``card_info.set_id`` / ``card_info.set_code``, except for cards listed by a set, where both
    come from the response's ``set`` object (the Pokémon listing puts the numeric id in
    ``card_info.set_code``). One Piece search and detail answers carry neither, so both are None.
    """

    #: ``pk_…``, ``op_…``, ``<code>_…`` or a 64-character hex CardMarket id. Reuse as is.
    id: str
    name: str
    clean_name: Optional[str]
    number: Optional[str]
    rarity: Optional[str]
    card_type: Optional[str]
    product_type: Optional[str]
    text: Optional[str]
    variants: List[str]
    set_id: Optional[str]
    set_code: Optional[str]
    set_name: Optional[str]
    tcgplayer: Optional[TcgplayerBlock]
    cardmarket: Optional[CardmarketBlock]
    #: Game-specific fields: ``hp``, ``attacks``, ``p``, ``t``, ``ext_color``... as sent by the API.
    info: Dict[str, Any]
    raw: Any = None


@dataclass
class SetSummary:
    #: Numeric set id as a string (``set_id``; ``group_id`` for One Piece).
    id: str
    code: Optional[str]
    name: str
    #: Free text. Pokémon uses ``eng``/``jap``/``chn``, One Piece ``en``/``jp``.
    language: Optional[str]
    release_date: Optional[str]
    card_count: Optional[int]
    sealed_count: Optional[int]
    raw: Any = None


@dataclass
class Page:
    items: List[Card]
    page: int
    limit: int
    total: int
    #: Computed from ``total`` and ``limit``, so it is always a finite number.
    total_pages: int


@dataclass
class SearchPage(Page):
    #: Games only: the search stopped at its cap, refine the query instead of paging.
    truncated: bool = False


@dataclass
class SetPage(Page):
    set: Optional[SetSummary] = None


@dataclass
class PriceRow:
    id: str
    number: Optional[str]
    name: str
    variant: Optional[str]
    product_type: Optional[str]
    tcgplayer: Optional[TcgPrice]
    cardmarket: Optional[CardmarketPrice]


@dataclass
class SetPrices:
    source: str
    set_id: Optional[str]
    set_code: Optional[str]
    rows: List[PriceRow]
    total: int
    raw: Any = None


@dataclass
class SetRef:
    id: Optional[str]
    code: Optional[str]
    name: Optional[str]
    total_cards: Optional[int] = None


@dataclass
class MostExpensive:
    id: Optional[str]
    name: Optional[str]
    price: Optional[float]


@dataclass
class PriceStats:
    avg: Optional[float]
    min: Optional[float]
    max: Optional[float]
    most_expensive: Optional[MostExpensive]
    trend_direction: Optional[str]


@dataclass
class SetStatistics:
    set: SetRef
    tcgplayer: Optional[PriceStats]
    cardmarket: Optional[PriceStats]
    rarity_breakdown: Dict[str, int]
    raw: Any = None


@dataclass
class TcgCompletion:
    currency: Optional[str]
    low: Optional[float]
    market: Optional[float]
    high: Optional[float]


@dataclass
class CardmarketCompletion:
    currency: Optional[str]
    low: Optional[float]
    avg: Optional[float]
    trend: Optional[float]


@dataclass
class RarityCost:
    count: int
    total_cost: Optional[float]


@dataclass
class CompletionValue:
    set: SetRef
    tcgplayer: Optional[TcgCompletion]
    cardmarket: Optional[CardmarketCompletion]
    by_rarity: Dict[str, RarityCost]
    note: Optional[str]
    raw: Any = None


@dataclass
class Mover:
    name: Optional[str]
    change: Optional[str]


@dataclass
class TrendingSet:
    set: SetRef
    card_count: Optional[int]
    #: As sent: ``+446.7%``.
    change: Optional[str]
    change_pct: Optional[float]
    avg_price_current: Optional[float]
    avg_price_previous: Optional[float]
    top_movers: List[Mover]
    raw: Any = None


@dataclass
class TopCard:
    id: str
    name: str
    number: Optional[str]
    rarity: Optional[str]
    set_name: Optional[str]
    set_id: Optional[str]
    set_code: Optional[str]
    price: Optional[float]
    change_7d: Optional[str]
    raw: Any = None


@dataclass
class HistoryPoint:
    #: Snapshot price keyed by days back: 7, 14, 30, 60, 120.
    price: Dict[int, Optional[float]]
    change: Dict[int, Optional[str]]
    current: Dict[str, Optional[float]]
    last_updated: Optional[str]


@dataclass
class PriceHistory:
    id: str
    name: Optional[str]
    tcgplayer: Optional[Dict[str, HistoryPoint]]
    cardmarket: Optional[Dict[str, HistoryPoint]]
    raw: Any = None


@dataclass
class Game:
    #: Route prefix and ``game`` code: ``mtg``, ``ygo``, ...
    code: str
    name: str
    #: Free routes, keyed by role: ``sets``, ``set``, ``card``, ``search``, ``image``.
    endpoints: Dict[str, str]
    #: Plan-gated routes: ``prices``, ``statistics``, ``completion_value``, ``trending``, ``top_cards``.
    pro_endpoints: Dict[str, str]
    raw: Any = None


@dataclass
class HealthCheck:
    #: ``healthy``, ``degraded`` or ``unhealthy``.
    status: str
    #: Set by the server when the check failed or is limited.
    message: Optional[str]
    response_time: Optional[float]


@dataclass
class Health:
    #: Overall status: ``healthy`` or ``unhealthy``. Only the database and storage are critical.
    status: str
    timestamp: Optional[str]
    version: Optional[str]
    #: Per-service checks: ``database``, ``cache``, ``storage``.
    checks: Dict[str, HealthCheck]
    response_time: Optional[float]
    region: Optional[str]
    message: Optional[str]
    raw: Any = None
