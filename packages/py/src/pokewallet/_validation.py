from __future__ import annotations

from typing import Optional
from urllib.parse import quote

from .errors import ValidationError


def check_page(page: Optional[int]) -> Optional[int]:
    if page is None:
        return None
    if isinstance(page, bool) or not isinstance(page, int) or page < 1:
        raise ValidationError(f"page must be an integer >= 1 (got {page!r})")
    return page


def check_limit(limit: Optional[int], maximum: int) -> Optional[int]:
    """``limit`` must be an integer in [1, max]. Checked here so out-of-range values never reach the server."""
    if limit is None:
        return None
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1 or limit > maximum:
        raise ValidationError(f"limit must be an integer between 1 and {maximum} (got {limit!r})")
    return limit


def check_period(period: Optional[str]) -> str:
    """Only ``7d`` exists, in every world."""
    if period is not None and period != "7d":
        raise ValidationError(f"period {period} is not available (only 7d)")
    return "7d"


def check_variant(variant: Optional[str]) -> Optional[str]:
    """``variant`` is ``normal`` or ``foil``."""
    if variant is not None and variant not in ("normal", "foil"):
        raise ValidationError(f"variant must be normal or foil (got {variant!r})")
    return variant


def check_text(name: str, value: str, minimum: int = 1) -> str:
    if not isinstance(value, str) or len(value.strip()) < minimum:
        plural = "" if minimum == 1 else "s"
        raise ValidationError(f"{name} must be at least {minimum} character{plural} long")
    return value.strip()


def seg(value: str) -> str:
    """Path segment for a user-supplied id or set code."""
    return quote(check_text("id", value), safe="")
