from __future__ import annotations

import re
from typing import Optional
from urllib.parse import quote, urlencode

from ._version import DEFAULT_BASE_URL
from .errors import ValidationError
from .types import GAME_CODES

_IMAGE_PATH = re.compile(r"^/([a-z]+/)?images/[^/?#]+(\?[^#]*)?$")


def image_url(
    card_id: str,
    *,
    base_url: Optional[str] = None,
    size: Optional[str] = None,
    lang: Optional[str] = None,
    set: Optional[str] = None,  # noqa: A002 - mirrors the API's query parameter name
) -> str:
    """Build the image URL of a card from its id, or from the relative ``Card.image.path`` the API returns
    (``/images/pk_…?lang=it``), which already names the right language. Pure string work: nothing is fetched.

    The image routes are protected like every other route: the request MUST carry the
    ``X-API-Key`` header, so the URL cannot be used directly in an ``<img>`` tag. Fetch it
    yourself with the header, or proxy it server-side. ``size`` (``low``/``high``), ``lang``
    and ``set`` apply to Pokémon ids only.
    """
    clean = card_id.strip()
    if not clean:
        raise ValidationError("id is required")
    base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    # A path from the API is already complete: it only needs the host.
    if clean.startswith("/"):
        if not _IMAGE_PATH.match(clean):
            raise ValidationError(f"not an image path: {clean}")
        return f"{base}{clean}"
    game = next((g for g in GAME_CODES if clean.lower().startswith(g + "_")), None)
    path = f"/{game}/images/{quote(clean, safe='')}" if game else f"/images/{quote(clean, safe='')}"
    query = {} if game else {k: v for k, v in (("size", size), ("lang", lang), ("set", set)) if v}
    return f"{base}{path}" + (f"?{urlencode(query)}" if query else "")
