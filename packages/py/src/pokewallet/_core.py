"""I/O-free core shared by the sync and async clients: credentials, headers, response handling, retry rules."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional, Tuple

from ._error_map import error_from_response
from .errors import PokeWalletError, RateLimitError, ValidationError
from ._version import DEFAULT_BASE_URL, DEFAULT_USER_AGENT

MASK = "pk_***"
_GAME_PREFIXES = ("/mtg/", "/ygo/", "/cfv/", "/dbs/", "/fab/", "/dgm/", "/swu/", "/lor/", "/rft/", "/cpk/")


@dataclass
class RateLimitInfo:
    """Quota counters from the ``X-RateLimit-*`` headers of the last answer."""

    limit_hour: Optional[int]
    remaining_hour: Optional[int]
    limit_day: Optional[int]
    remaining_day: Optional[int]


class Credentials:
    """Holds the API key in a closure: not in ``vars()``, not in repr/str, not picklable or copyable."""

    __slots__ = ("_get",)

    def __init__(self, key: Optional[str]) -> None:
        def get() -> Optional[str]:
            return key

        object.__setattr__(self, "_get", get)

    @property
    def present(self) -> bool:
        return self._get() is not None

    def header_value(self) -> Optional[str]:
        return self._get()

    def redact(self, value: str) -> str:
        key = self._get()
        return value if key is None else value.replace(key, MASK)

    def __repr__(self) -> str:
        return f"<Credentials {MASK if self.present else 'none'}>"

    __str__ = __repr__

    def __reduce__(self) -> Any:
        raise TypeError("API credentials cannot be pickled or copied")

    def __setattr__(self, name: str, value: Any) -> None:
        raise AttributeError("credentials are read-only")


KEY_REQUIRED = "An API key is required: pass apiKey or set POKEWALLET_API_KEY"


def read_key(api_key: Optional[str]) -> Optional[str]:
    """The key from the argument or the environment; None when there is none (public endpoints still work)."""
    key = (api_key or os.environ.get("POKEWALLET_API_KEY") or "").strip()
    if not key:
        return None
    if not key.startswith("pk_"):
        raise ValidationError('API keys start with "pk_"')
    return key


def parse_retry_after(value: Optional[str]) -> Optional[float]:
    """Seconds from a ``Retry-After`` value (delta-seconds or HTTP date), or None."""
    if value is None or not value.strip():
        return None
    try:
        n = float(value)
    except ValueError:
        from email.utils import parsedate_to_datetime
        from datetime import datetime, timezone

        try:
            when = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())
    return n if n >= 0 else None


def _int(headers: Mapping[str, str], name: str) -> Optional[int]:
    value = headers.get(name)
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


class Core:
    def __init__(
        self,
        api_key: Optional[str],
        base_url: Optional[str],
        user_agent: Optional[str],
        max_retries: int,
        retry_after_cap: float,
        timeout: float,
    ) -> None:
        self.credentials = Credentials(read_key(api_key))
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.user_agent = user_agent or DEFAULT_USER_AGENT
        self.max_retries = max_retries
        self.retry_after_cap = retry_after_cap
        self.timeout = timeout
        self.last_rate_limit: Optional[RateLimitInfo] = None

    def url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def headers(self) -> dict:
        key = self.credentials.header_value()
        base = {"User-Agent": self.user_agent, "Accept": "application/json"}
        return base if key is None else {"X-API-Key": key, **base}

    def require_key(self, public: bool) -> None:
        """Raised before any network call: only the two public endpoints work without a key."""
        if not public and not self.credentials.present:
            raise ValidationError(KEY_REQUIRED)

    def network_error_message(self, exc: BaseException) -> str:
        return self.credentials.redact(f"Request failed before an answer arrived: {type(exc).__name__}: {exc}")

    def interpret(
        self, status: int, headers: Mapping[str, str], body_text: str, path: str
    ) -> Tuple[Any, Optional[PokeWalletError], Optional[float]]:
        """Returns (body, error, retry_after). The body never contains the key."""
        body = _parse_json(self.credentials.redact(body_text))
        self._track_quota(headers)
        if 200 <= status < 300:
            return body, None, None
        retry_after = parse_retry_after(headers.get("retry-after"))
        return body, error_from_response(status, body, retry_after, path.startswith(_GAME_PREFIXES)), retry_after

    def wait_before_retry(self, err: PokeWalletError, retry_after: Optional[float], attempt: int) -> Optional[float]:
        """Seconds to wait before the next attempt, or None when the error must be raised."""
        if attempt >= self.max_retries:
            return None
        if err.status == 429:
            # Never guess a wait: no header, or an exhausted window, means retrying is pointless.
            ok = retry_after is not None and retry_after <= self.retry_after_cap
            if ok and isinstance(err, RateLimitError) and err.exhausted:
                ok = False
            return retry_after if ok else None
        if err.status == 503:
            wait = 1.0 if retry_after is None else retry_after
            return wait if wait <= self.retry_after_cap else None
        return None

    def _track_quota(self, headers: Mapping[str, str]) -> None:
        info = RateLimitInfo(
            _int(headers, "x-ratelimit-limit-hour"),
            _int(headers, "x-ratelimit-remaining-hour"),
            _int(headers, "x-ratelimit-limit-day"),
            _int(headers, "x-ratelimit-remaining-day"),
        )
        if any(v is not None for v in (info.limit_hour, info.remaining_hour, info.limit_day, info.remaining_day)):
            self.last_rate_limit = info

    def __repr__(self) -> str:
        return f"Core(base_url={self.base_url!r}, user_agent={self.user_agent!r}, api_key={MASK if self.credentials.present else None!r})"


def _parse_json(text: str) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return {"error": text[:200]}


def clean_query(query: Optional[Mapping[str, Any]]) -> dict:
    return {k: v for k, v in (query or {}).items() if v is not None}


Sleep = Callable[[float], Any]
