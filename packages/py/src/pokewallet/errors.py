"""Typed errors. Every API answer that is not a success maps to one of these."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional


@dataclass
class LimitWindow:
    limit: int
    used: int
    remaining: int


@dataclass
class SetMatch:
    """One candidate of an ambiguous set. ``set_id`` is the value to pass back to pick it."""

    set_id: str
    set_code: Optional[str]
    name: Optional[str]
    language: Optional[str]
    release_date: Optional[str]


def _body_str(body: Any, key: str) -> Optional[str]:
    if isinstance(body, dict):
        value = body.get(key)
        if isinstance(value, str):
            return value
    return None


class PokeWalletError(Exception):
    """Base class of every error raised for an API answer."""

    def __init__(self, status: int, body: Any = None, message: Optional[str] = None) -> None:
        self.status = status
        #: Parsed JSON body of the answer, when there was one.
        self.body = body
        #: The ``error`` field of the body, when present.
        self.code = _body_str(body, "error")
        super().__init__(message or _body_str(body, "message") or self.code or f"HTTP {status}")


class ValidationError(ValueError):
    """Raised before any request when an argument is out of range."""


class NetworkError(Exception):
    """The request never produced an HTTP answer (DNS, connection, timeout)."""


class BadRequestError(PokeWalletError):
    """400: missing or invalid parameter, or an id that cannot be decoded."""


class AuthError(PokeWalletError):
    """401: key missing, malformed or unknown."""


class PlanRequiredError(PokeWalletError):
    """403 on a plan-gated endpoint.

    ``redeem_url`` is set when the free trial was never activated; ``upgrade_url`` when the
    trial expired or the plan is too low.
    """

    def __init__(self, status: int, body: Any = None, message: Optional[str] = None) -> None:
        super().__init__(status, body, message)
        self.redeem_url = _body_str(body, "redeem_url")
        self.upgrade_url = _body_str(body, "upgrade_url")


class FeatureNotEnabledError(PokeWalletError):
    """403 ``Feature not enabled``: this account does not have access to this feature."""

    def __init__(self, status: int, body: Any = None, message: Optional[str] = None) -> None:
        super().__init__(status, body, message)
        self.contact_url = _body_str(body, "contact_url")


class NotFoundError(PokeWalletError):
    """404: unknown card, set or route. Carries the server's suggestions when it sent any."""

    def __init__(self, status: int, body: Any = None, message: Optional[str] = None) -> None:
        super().__init__(status, body, message)
        self.did_you_mean = _body_str(body, "did_you_mean")
        suggestions = body.get("suggestions") if isinstance(body, dict) else None
        self.suggestions: List[Any] = suggestions if isinstance(suggestions, list) else []


class GameUnavailableError(NotFoundError):
    """404 on a game route: the game is switched off for this account."""


class AmbiguousSetError(PokeWalletError):
    """The set code matches several sets (200, 300 or 409 on the wire). Retry with ``matches[i].set_id``."""

    def __init__(self, status: int, body: Any, matches: List[SetMatch]) -> None:
        super().__init__(status, body, "Several sets match this code: pick one by set_id")
        self.matches = matches


class RateLimitError(PokeWalletError):
    """429. The API sends no ``Retry-After``; the SDK retries only when it is present and within the cap.

    ``hourly`` / ``daily`` mirror the body: a window with ``remaining == 0`` cannot be waited out.
    """

    def __init__(self, status: int, body: Any = None, retry_after: Optional[float] = None) -> None:
        super().__init__(status, body)
        self.retry_after = retry_after
        limits = body.get("limits") if isinstance(body, dict) else None
        limits = limits if isinstance(limits, dict) else {}
        self.hourly = _window(limits.get("hourly"))
        self.daily = _window(limits.get("daily"))

    @property
    def exhausted(self) -> bool:
        return any(w is not None and w.remaining <= 0 for w in (self.hourly, self.daily))


class UnavailableError(PokeWalletError):
    """503: database busy or feature not yet enabled. ``retry_after`` is 5 or 3600 seconds."""

    def __init__(self, status: int, body: Any = None, retry_after: Optional[float] = None) -> None:
        super().__init__(status, body)
        self.retry_after = retry_after


class ServerError(PokeWalletError):
    """Any other 5xx. Never retried."""


def _window(value: Any) -> Optional[LimitWindow]:
    if not isinstance(value, dict):
        return None
    try:
        return LimitWindow(int(value["limit"]), int(value["used"]), int(value["remaining"]))
    except (KeyError, TypeError, ValueError):
        return None
