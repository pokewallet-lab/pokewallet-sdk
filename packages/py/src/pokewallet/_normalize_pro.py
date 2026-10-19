"""Normalizers for the plan-gated endpoints (prices, statistics, rankings, history)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ._normalize import (
    arr, cardmarket_price, integer, num, rec, set_pair, set_ref, tcg_price, text,
)
from .types import (
    CardmarketCompletion, CompletionValue, HistoryPoint, MostExpensive, Mover, PriceHistory,
    PriceRow, PriceStats, RarityCost, SetPrices, SetStatistics, TcgCompletion,
    TopCard, TrendingSet,
)

_DAYS = (7, 14, 30, 60, 120)


def normalize_set_prices(raw: Any) -> SetPrices:
    """Pokémon and One Piece name the set id ``group_id``, the games ``set_id``."""
    r = rec(raw)
    pair = set_pair(r.get("set_code"), r.get("set_id", r.get("group_id")))
    rows: List[PriceRow] = []
    for d in arr(r.get("data")):
        row = rec(d)
        rows.append(PriceRow(
            id=text(row.get("id")) or "",
            number=text(row.get("card_number")),
            name=text(row.get("name")) or "",
            variant=text(row.get("variant")),
            product_type=text(row.get("product_type")),
            tcgplayer=tcg_price(row["tcgplayer"], row.get("variant")) if row.get("tcgplayer") else None,
            cardmarket=cardmarket_price(row["cardmarket"], row.get("variant")) if row.get("cardmarket") else None,
        ))
    total = integer(r.get("total"))
    return SetPrices(text(r.get("source")) or "both", pair.id, pair.code, rows, total if total is not None else len(rows), raw)


def _price_stats(value: Any) -> Optional[PriceStats]:
    if not isinstance(value, dict):
        return None
    top = rec(value["most_expensive"]) if value.get("most_expensive") else None
    return PriceStats(
        avg=num(value.get("avg_market_price", value.get("avg_price"))),
        min=num(value.get("min_price")),
        max=num(value.get("max_price")),
        most_expensive=MostExpensive(text(top.get("id")), text(top.get("name")), num(top.get("price"))) if top is not None else None,
        trend_direction=text(value.get("trend_direction")),
    )


def normalize_statistics(raw: Any) -> SetStatistics:
    r = rec(raw)
    info = rec(r.get("set_info"))
    stats = rec(r.get("price_statistics"))
    return SetStatistics(
        set=set_ref(info.get("name"), info.get("set_code"), info.get("set_id"), info.get("total_cards")),
        tcgplayer=_price_stats(stats.get("tcgplayer")),
        cardmarket=_price_stats(stats.get("cardmarket")),
        rarity_breakdown={k: integer(v) or 0 for k, v in rec(r.get("rarity_breakdown")).items()},
        raw=raw,
    )


def normalize_completion_value(raw: Any) -> CompletionValue:
    r = rec(raw)
    info = rec(r.get("set_info"))
    cost = rec(r.get("completion_cost"))
    t = rec(cost["tcgplayer"]) if cost.get("tcgplayer") else None
    c = rec(cost["cardmarket"]) if cost.get("cardmarket") else None
    by_rarity: Dict[str, RarityCost] = {
        k: RarityCost(integer(rec(v).get("count")) or 0, num(rec(v).get("total_cost")))
        for k, v in rec(r.get("breakdown_by_rarity")).items()
    }
    return CompletionValue(
        set=set_ref(info.get("name"), info.get("set_code"), info.get("set_id"), info.get("total_cards")),
        tcgplayer=TcgCompletion(text(t.get("currency")), num(t.get("low_estimate")), num(t.get("market_estimate")), num(t.get("high_estimate"))) if t is not None else None,
        cardmarket=CardmarketCompletion(text(c.get("currency")), num(c.get("low_estimate")), num(c.get("avg_estimate")), num(c.get("trend_estimate"))) if c is not None else None,
        by_rarity=by_rarity,
        note=text(cost.get("note")),
        raw=raw,
    )


def _pct(value: Any) -> Optional[float]:
    s = text(value)
    return None if s is None else num(s.replace("%", "").replace("+", ""))


def normalize_trending(raw: Any) -> List[TrendingSet]:
    out: List[TrendingSet] = []
    for item in arr(rec(raw).get("trending_sets")):
        s = rec(item)
        cm = rec(s.get("cardmarket"))
        out.append(TrendingSet(
            set=set_ref(s.get("set_name"), s.get("set_code"), s.get("set_id")),
            card_count=integer(s.get("card_count")),
            change=text(cm.get("price_change")),
            change_pct=_pct(cm.get("price_change")),
            avg_price_current=num(cm.get("avg_price_current")),
            avg_price_previous=num(cm.get("avg_price_previous")),
            top_movers=[Mover(text(rec(m).get("name")), text(rec(m).get("change"))) for m in arr(cm.get("top_movers"))],
            raw=item,
        ))
    return out


def normalize_top_cards(raw: Any) -> List[TopCard]:
    out: List[TopCard] = []
    for item in arr(rec(raw).get("top_cards")):
        c = rec(item)
        info = rec(c.get("card_info"))
        pair = set_pair(info.get("set_code"), info.get("set_id"))
        out.append(TopCard(
            id=text(c.get("id")) or "",
            name=text(info.get("name")) or "",
            number=text(info.get("card_number")),
            rarity=text(info.get("rarity")),
            set_name=text(info.get("set_name")),
            set_id=pair.id,
            set_code=pair.code,
            price=num(c.get("current_price")),
            change_7d=text(c.get("change_7d")),
            raw=item,
        ))
    return out


def _history_side(value: Any) -> Optional[Dict[str, HistoryPoint]]:
    if not isinstance(value, dict):
        return None
    out: Dict[str, HistoryPoint] = {}
    for name, data in rec(value.get("variants")).items():
        d = rec(data)
        out[name] = HistoryPoint(
            price={day: num(d.get(f"price_{day}d")) for day in _DAYS},
            change={day: text(d.get(f"change_{day}d")) for day in _DAYS},
            current={k: num(v) for k, v in rec(d.get("current")).items()},
            last_updated=text(d.get("last_updated")),
        )
    return out


def normalize_price_history(raw: Any) -> PriceHistory:
    r = rec(raw)
    return PriceHistory(text(r.get("id")) or "", text(r.get("card_name")), _history_side(r.get("tcgplayer")), _history_side(r.get("cardmarket")), raw)
