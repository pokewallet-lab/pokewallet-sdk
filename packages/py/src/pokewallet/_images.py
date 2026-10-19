from __future__ import annotations

from typing import Optional
from urllib.parse import quote, urlencode

from ._version import DEFAULT_BASE_URL
from .errors import ValidationError
from .types import GAME_CODES


def image_url(
    card_id: str,
    *,
    base_url: Optional[str] = None,
    size: Optional[str] = None,
    lang: Optional[str] = None,
    set: Optional[str] = None,  # noqa: A002 - mirrors the API's query parameter name
) -> str:
    """Build the image URL of a card from its id. Pure string work: nothing is fetched.

    The image routes are protected like every other route: the request MUST carry the
    ``X-API-Key`` header, so the URL cannot be used directly in an ``<img>`` tag. Fetch it
    yourself with the header, or proxy it server-side. ``size`` (``low``/``high``), ``lang``
    and ``set`` apply to Pokémon ids only.
    """
    clean = card_id.strip()
    if not clean:
        raise ValidationError("id is required")
    base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    game = next((g for g in GAME_CODES if clean.lower().startswith(g + "_")), None)
    path = f"/{game}/images/{quote(clean, safe='')}" if game else f"/images/{quote(clean, safe='')}"
    query = {} if game else {k: v for k, v in (("size", size), ("lang", lang), ("set", set)) if v}
    return f"{base}{path}" + (f"?{urlencode(query)}" if query else "")
