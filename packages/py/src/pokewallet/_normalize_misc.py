"""Normalizers for the two public endpoints."""
from __future__ import annotations

from typing import Any, Dict, List

from ._normalize import arr, num, rec, text
from .types import GAME_CODES, Game, Health, HealthCheck


def _strings(value: Any) -> Dict[str, str]:
    return {k: v for k, v in rec(value).items() if isinstance(v, str)}


def normalize_games(raw: Any) -> List[Game]:
    """``/games``: ``{success, data: [{code, name, endpoints, pro_endpoints}]}`` becomes a plain list."""
    out: List[Game] = []
    for item in arr(rec(raw).get("data")):
        g = rec(item)
        code = text(g.get("code"))
        if code is None or code not in GAME_CODES:
            continue
        out.append(Game(code, text(g.get("name")) or code, _strings(g.get("endpoints")), _strings(g.get("pro_endpoints")), item))
    return out


def is_health_report(body: Any) -> bool:
    """True when a body looks like a health report, whatever the HTTP status."""
    return isinstance(rec(body).get("status"), str)


def normalize_health(raw: Any) -> Health:
    r = rec(raw)
    checks = {
        name: HealthCheck(text(rec(v).get("status")) or "unknown", text(rec(v).get("message")), num(rec(v).get("responseTime")))
        for name, v in rec(r.get("checks")).items()
    }
    return Health(
        status=text(r.get("status")) or "unknown",
        timestamp=text(r.get("timestamp")),
        version=text(r.get("version")),
        checks=checks,
        response_time=num(r.get("responseTime")),
        region=text(r.get("region")),
        message=text(r.get("message")),
        raw=raw,
    )
