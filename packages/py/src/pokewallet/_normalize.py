"""Turns raw API payloads into the public models (cards, prices, sets)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, NamedTuple, Optional

from .types import (
    Card,
    CardmarketBlock,
    CardmarketPrice,
    SetRef,
    SetSummary,
    TcgplayerBlock,
    TcgPrice,
)

_NUMERIC_ID = re.compile(r"^-?\d+$")
_KNOWN = {
    "name", "clean_name", "set_name", "set_code", "set_id", "card_number", "rarity",
    "card_type", "product_type", "variants", "card_text",
}


def rec(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def arr(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def text(value: Any) -> Optional[str]:
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return None


def num(value: Any) -> Optional[float]:
    """Numbers pass through, numeric strings are converted, everything else is None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value == value and abs(value) != float("inf") else None
    if isinstance(value, str) and value.strip():
        try:
            n = float(value)
        except ValueError:
            return None
        return n if n == n and abs(n) != float("inf") else None
    return None


def integer(value: Any) -> Optional[int]:
    n = num(value)
    return int(n) if n is not None else None


class SetPair(NamedTuple):
    id: Optional[str]
    code: Optional[str]


def set_pair(code: Any, set_id: Any) -> SetPair:
    """Some answers put the numeric set id in a field named ``set_code`` and omit ``set_id``.

    When no id is given and the "code" is purely numeric, it is the id.
    """
    c, i = text(code), text(set_id)
    if i is None and c is not None and _NUMERIC_ID.match(c):
        return SetPair(c, None)
    return SetPair(i, c)


def set_ref(name: Any, code: Any, set_id: Any, total_cards: Any = None) -> SetRef:
    pair = set_pair(code, set_id)
    return SetRef(id=pair.id, code=pair.code, name=text(name), total_cards=integer(total_cards))


def tcg_price(value: Any, variant: Any = None) -> TcgPrice:
    r = rec(value)
    return TcgPrice(
        variant=text(variant if variant is not None else r.get("sub_type_name", r.get("variant"))),
        low=num(r.get("low_price")),
        mid=num(r.get("mid_price")),
        high=num(r.get("high_price")),
        market=num(r.get("market_price")),
        direct_low=num(r.get("direct_low_price")),
        updated_at=text(r.get("updated_at")),
        raw=value,
    )


def cardmarket_price(value: Any, variant: Any = None) -> CardmarketPrice:
    r = rec(value)
    return CardmarketPrice(
        variant=text(variant if variant is not None else r.get("variant_type", r.get("variant"))),
        avg=num(r.get("avg")),
        low=num(r.get("low")),
        trend=num(r.get("trend")),
        avg1=num(r.get("avg1")),
        avg7=num(r.get("avg7")),
        avg30=num(r.get("avg30")),
        updated_at=text(r.get("updated_at")),
        raw=value,
    )


def normalize_card(raw: Any, ctx: Optional[SetPair] = None) -> Card:
    """Card in the Pokémon shape (Pokémon and the ten games)."""
    r = rec(raw)
    info = rec(r.get("card_info"))
    tcg = rec(r["tcgplayer"]) if r.get("tcgplayer") else None
    cm = rec(r["cardmarket"]) if r.get("cardmarket") else None
    pair = ctx or set_pair(info.get("set_code"), info.get("set_id"))
    return Card(
        id=text(r.get("id")) or "",
        name=text(info.get("name")) or "",
        clean_name=text(info.get("clean_name")),
        number=text(info.get("card_number")),
        rarity=text(info.get("rarity")),
        card_type=text(info.get("card_type")),
        product_type=text(info.get("product_type")),
        text=text(info.get("card_text")),
        variants=[v for v in arr(info.get("variants")) if isinstance(v, str)],
        set_id=pair.id,
        set_code=pair.code,
        set_name=text(info.get("set_name")),
        tcgplayer=TcgplayerBlock(text(tcg.get("url")), [tcg_price(p) for p in arr(tcg.get("prices"))]) if tcg is not None else None,
        cardmarket=CardmarketBlock(
            text(cm.get("product_name")), text(cm.get("product_url")), [cardmarket_price(p) for p in arr(cm.get("prices"))]
        ) if cm is not None else None,
        info={k: v for k, v in info.items() if k not in _KNOWN},
        raw=raw,
    )


def normalize_op_card(raw: Any, ctx: Optional[SetPair] = None) -> Card:
    """One Piece card: flat, ``ext_*`` fields, a single price object per source."""
    r = rec(raw)
    tcg = rec(r["tcgplayer"]) if r.get("tcgplayer") else None
    cm = rec(r["cardmarket"]) if r.get("cardmarket") else None
    finish = r.get("sub_type_name")
    return Card(
        id=text(r.get("id")) or "",
        name=text(r.get("name")) or "",
        clean_name=text(r.get("clean_name")),
        number=text(r.get("card_number")),
        rarity=text(r.get("rarity")),
        card_type=text(r.get("card_type")),
        product_type=text(r.get("product_type")),
        text=text(r.get("ext_description")),
        variants=[finish] if isinstance(finish, str) else [],
        set_id=ctx.id if ctx else None,
        set_code=ctx.code if ctx else None,
        set_name=None,
        tcgplayer=TcgplayerBlock(text(tcg.get("url")), [tcg_price(tcg["prices"], finish)] if tcg.get("prices") else []) if tcg is not None else None,
        cardmarket=CardmarketBlock(
            text(cm.get("product_name")), text(cm.get("product_url")), [cardmarket_price(cm["prices"], finish)] if cm.get("prices") else []
        ) if cm is not None else None,
        info={k: v for k, v in r.items() if k.startswith("ext_")},
        raw=raw,
    )


def normalize_set(raw: Any) -> SetSummary:
    """Set entry from any list or detail. One Piece names the id ``group_id``, everything else ``set_id``."""
    r = rec(raw)
    return SetSummary(
        id=text(r.get("set_id")) or text(r.get("group_id")) or "",
        code=text(r.get("set_code")),
        name=text(r.get("name")) or text(r.get("set_name")) or "",
        language=text(r.get("language")),
        release_date=text(r.get("release_date")),
        card_count=integer(r.get("card_count", r.get("total_cards"))),
        sealed_count=integer(r.get("sealed_count")),
        raw=raw,
    )
