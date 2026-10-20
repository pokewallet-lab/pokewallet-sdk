"""Pure request builders and response parsers, one dialect per API family.

Nothing here does I/O, so the sync and async worlds share it verbatim.
"""
from __future__ import annotations

import re
from typing import Any, Dict, NamedTuple, Optional

from ._error_map import ambiguous_set_error, is_disambiguation
from ._normalize import (
    SetPair, arr, integer, normalize_card, normalize_op_card, normalize_set, rec,
)
from ._normalize_pro import (
    normalize_completion_value, normalize_price_history, normalize_set_prices,
    normalize_statistics, normalize_top_cards, normalize_trending,
)
from ._validation import check_limit, check_page, check_period, check_text, check_variant, seg
from .errors import ValidationError
from .types import SearchPage, SetPage

LIMITS = {"search": 100, "set": 200, "trending": 50, "top_cards": 100}
_NUMERIC_ID = re.compile(r"^-?\d+$")


class Req(NamedTuple):
    path: str
    query: Dict[str, Any]


def make_page_meta(meta: Any, count: int) -> Dict[str, int]:
    page = integer(meta.get("page")) or 1
    limit = integer(meta.get("limit"))
    limit = count if limit is None else limit
    total = integer(meta.get("total"))
    total = count if total is None else total
    total_pages = -(-total // limit) if limit > 0 else 0
    return {"page": page, "limit": limit, "total": total, "total_pages": total_pages}


class CardDialect:
    """Pokémon and the ten games share one response shape."""

    def __init__(self, prefix: str, min_query: int) -> None:
        self.prefix = prefix
        self.min_query = min_query

    def _p(self, rest: str) -> str:
        return f"{self.prefix}{rest}"

    def search(self, q: str, page: Optional[int], limit: Optional[int]) -> Req:
        return Req(self._p("/search"), {"q": check_text("q", q, self.min_query), "page": check_page(page), "limit": check_limit(limit, LIMITS["search"])})

    def parse_search(self, body: Any) -> SearchPage:
        b = rec(body)
        items = [normalize_card(c) for c in arr(b.get("results"))]
        meta = make_page_meta(rec(b.get("pagination")), len(items))
        return SearchPage(items=items, truncated=rec(b.get("metadata")).get("truncated") is True, **meta)

    def card(self, card_id: str, set_code: Optional[str] = None) -> Req:
        return Req(self._p(f"/cards/{seg(card_id)}"), {"set_code": set_code})

    def parse_card(self, body: Any) -> Any:
        if is_disambiguation(body):
            raise ambiguous_set_error(200, body)
        return normalize_card(body)

    def sets(self, language: Optional[str]) -> Req:
        return Req(self._p("/sets"), {"language": language})

    def parse_sets(self, body: Any) -> Any:
        return [normalize_set(s) for s in arr(rec(body).get("data"))]

    def set(self, code: str, page: Optional[int], limit: Optional[int], language: Optional[str]) -> Req:
        return Req(self._p(f"/sets/{seg(code)}"), {"page": check_page(page), "limit": check_limit(limit, LIMITS["set"]), "language": language})

    def parse_set(self, body: Any) -> SetPage:
        b = rec(body)
        # 200 with a candidate list instead of cards: same condition as the 300/409 answers.
        if is_disambiguation(b):
            raise ambiguous_set_error(200, b)
        s = normalize_set(b.get("set"))
        # A set listing names its set once: use the set object for every card.
        ctx = SetPair(s.id or None, s.code)
        items = [normalize_card(c, ctx) for c in arr(b.get("cards"))]
        return SetPage(items=items, set=s, **make_page_meta(rec(b.get("pagination")), len(items)))

    def prices(self, code: str, source: Optional[str]) -> Req:
        return Req(self._p(f"/prices/{seg(code)}"), {"source": source})

    parse_prices = staticmethod(normalize_set_prices)

    def statistics(self, code: str, variant: Optional[str]) -> Req:
        return Req(self._p(f"/sets/{seg(code)}/statistics"), {"variant": check_variant(variant)})

    parse_statistics = staticmethod(normalize_statistics)

    def completion_value(self, code: str) -> Req:
        return Req(self._p(f"/sets/{seg(code)}/completion-value"), {})

    parse_completion_value = staticmethod(normalize_completion_value)

    def trending(self, period: Optional[str], limit: Optional[int]) -> Req:
        return Req(self._p("/sets/trending"), {"period": check_period(period), "limit": check_limit(limit, LIMITS["trending"])})

    parse_trending = staticmethod(normalize_trending)

    def top_cards(self, metric: Optional[str], source: Optional[str], limit: Optional[int]) -> Req:
        return Req(self._p("/analytics/top-cards"), {"metric": metric, "source": source, "limit": check_limit(limit, LIMITS["top_cards"])})

    parse_top_cards = staticmethod(normalize_top_cards)


class PokemonDialect(CardDialect):
    def __init__(self) -> None:
        super().__init__("", 1)

    def price_history(self, card_id: str) -> Req:
        return Req(f"/cards/{seg(card_id)}/price-history", {})

    parse_price_history = staticmethod(normalize_price_history)


class OnePieceDialect:
    """One Piece lives under ``/op`` with flat cards, flat pagination, ``group_id`` and set prices in the query."""

    def search(self, q: str, page: Optional[int], limit: Optional[int]) -> Req:
        return Req("/op/search", {"q": check_text("q", q), "page": check_page(page), "limit": check_limit(limit, LIMITS["search"])})

    def parse_search(self, body: Any) -> SearchPage:
        b = rec(body)
        items = [normalize_op_card(c) for c in arr(b.get("data"))]
        return SearchPage(items=items, truncated=False, **make_page_meta(b, len(items)))

    def card(self, card_id: str, set_code: Optional[str] = None) -> Req:
        return Req(f"/op/cards/{seg(card_id)}", {})

    def parse_card(self, body: Any) -> Any:
        return normalize_op_card(body)

    def sets(self, language: Optional[str]) -> Req:
        return Req("/op/sets", {"language": language})

    def parse_sets(self, body: Any) -> Any:
        return [normalize_set(s) for s in arr(rec(body).get("data"))]

    def set(self, code: str, page: Optional[int], limit: Optional[int], language: Optional[str]) -> Req:
        # language is ignored: One Piece maps a code to its first matching set.
        return Req(f"/op/sets/{seg(code)}", {"page": check_page(page), "limit": check_limit(limit, LIMITS["set"])})

    def parse_set(self, body: Any) -> SetPage:
        b = rec(body)
        s = normalize_set(b.get("set"))
        ctx = SetPair(s.id or None, s.code)
        items = [normalize_op_card(c, ctx) for c in arr(b.get("data"))]
        return SetPage(items=items, set=s, **make_page_meta(b, len(items)))

    def prices(self, code: str, source: Optional[str]) -> Req:
        if source is not None:
            raise ValidationError("source is not supported for One Piece prices")
        c = check_text("code", code)
        return Req("/op/prices", {"group_id": c} if _NUMERIC_ID.match(c) else {"set_code": c})

    parse_prices = staticmethod(normalize_set_prices)

    def statistics(self, code: str, variant: Optional[str]) -> Req:
        return Req(f"/op/sets/{seg(code)}/statistics", {"variant": check_variant(variant)})

    parse_statistics = staticmethod(normalize_statistics)

    def completion_value(self, code: str) -> Req:
        return Req(f"/op/sets/{seg(code)}/completion-value", {})

    parse_completion_value = staticmethod(normalize_completion_value)

    def trending(self, period: Optional[str], limit: Optional[int]) -> Req:
        return Req("/op/sets/trending", {"period": check_period(period), "limit": check_limit(limit, LIMITS["trending"])})

    parse_trending = staticmethod(normalize_trending)

    def top_cards(self, metric: Optional[str], source: Optional[str], limit: Optional[int]) -> Req:
        return Req("/op/analytics/top-cards", {"metric": metric, "source": source, "limit": check_limit(limit, LIMITS["top_cards"])})

    parse_top_cards = staticmethod(normalize_top_cards)
