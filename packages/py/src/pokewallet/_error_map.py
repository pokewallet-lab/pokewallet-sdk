from __future__ import annotations

from typing import Any, List, Optional

from .errors import (
    AmbiguousSetError, AuthError, BadRequestError, FeatureNotEnabledError, GameUnavailableError,
    NotFoundError, PlanRequiredError, PokeWalletError, RateLimitError, ServerError, SetMatch,
    UnavailableError,
)
from ._normalize import text


def to_set_matches(body: Any) -> List[SetMatch]:
    raw = body.get("matches") if isinstance(body, dict) else None
    if not isinstance(raw, list):
        return []
    out = []
    for m in raw:
        m = m if isinstance(m, dict) else {}
        out.append(SetMatch(
            set_id=text(m.get("set_id")) or "",
            set_code=text(m.get("set_code")),
            name=text(m.get("name")),
            language=text(m.get("language")),
            release_date=text(m.get("release_date")),
        ))
    return out


def is_disambiguation(body: Any) -> bool:
    """True for the 200 body the API uses to say "several sets match"."""
    return isinstance(body, dict) and body.get("disambiguation") is True


def ambiguous_set_error(status: int, body: Any) -> AmbiguousSetError:
    return AmbiguousSetError(status, body, to_set_matches(body))


def error_from_response(status: int, body: Any, retry_after: Optional[float], game_route: bool) -> PokeWalletError:
    """Maps a non-success answer to its typed error. Pure: no retry decisions here."""
    code = body.get("error") if isinstance(body, dict) else None
    if status == 300 or (status == 409 and (is_disambiguation(body) or code == "Ambiguous set code")):
        return ambiguous_set_error(status, body)
    if status == 400:
        return BadRequestError(status, body)
    if status == 401:
        return AuthError(status, body)
    if status == 403:
        return FeatureNotEnabledError(status, body) if code == "Feature not enabled" else PlanRequiredError(status, body)
    if status == 404:
        # A switched-off game answers with the generic route 404, not a resource 404.
        if game_route and code == "Endpoint not found":
            return GameUnavailableError(status, body)
        return NotFoundError(status, body)
    if status == 429:
        return RateLimitError(status, body, retry_after)
    if status == 503:
        return UnavailableError(status, body, retry_after)
    return ServerError(status, body) if status >= 500 else PokeWalletError(status, body)
