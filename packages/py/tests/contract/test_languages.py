"""Card languages against an API that serves ``lang``: set POKEWALLET_LANG_LIVE (and POKEWALLET_BASE_URL
for a non-production instance). Skipped otherwise, so the default run against production stays green."""
import os

import httpx
import pytest

from pokewallet import ValidationError

from ..conftest import failure, internal_fields
from .conftest import BASE_URL, HAS_LANG

pytestmark = pytest.mark.skipif(not HAS_LANG, reason="POKEWALLET_LANG_LIVE is not set")


@pytest.fixture(scope="module")
def sample(pw):
    return next(c for c in pw.pokemon.search("pinsir ethan", lang="it", limit=3).items if c.language == "it")


def test_a_translated_card_has_language_languages_and_an_image_path(pw, sample):
    c = pw.pokemon.card(sample.id, lang="IT")
    assert c.language == "it" and c.languages["en"] == ["data", "image"] and "data" in c.languages["it"]
    assert c.image.language == "it" and c.image.path == f"/images/{c.id}?lang=it"
    assert c.name != pw.pokemon.card(c.id).name
    assert pw.image_url(c.image.path).endswith(f"/images/{c.id}?lang=it")


def test_without_lang_languages_is_there_but_not_language_or_the_image_path(pw, sample):
    c = pw.pokemon.card(sample.id)
    assert c.language is None and c.languages["en"] == ["data", "image"] and c.image.path is None


def test_a_language_the_card_does_not_have_falls_back_to_english(pw, sample):
    c = pw.pokemon.card(sample.id, lang="ko")
    assert c.language == "en" and c.image.language == "en" and c.image.path == f"/images/{c.id}"


def test_en_and_ja_answer_like_no_lang(pw, sample):
    plain = pw.pokemon.card(sample.id)
    for lang in ("en", "ja"):
        assert pw.pokemon.card(sample.id, lang=lang).raw == plain.raw


def test_search_and_set_listings_translate_every_card(pw):
    page = pw.pokemon.set("DRI", lang="it", limit=5)
    assert page.items and all(c.language is not None and c.image.path for c in page.items)
    assert any(c.language == "it" for c in page.items)


def test_the_api_refuses_an_unknown_language_and_so_does_the_sdk(pw):
    res = httpx.get(f"{BASE_URL or 'https://api.pokewallet.io'}/search", params={"q": "pinsir", "lang": "xx"}, headers={"X-API-Key": os.environ["POKEWALLET_API_KEY"]})
    assert res.status_code == 400 and "lang must be one of" in res.text
    assert isinstance(failure(pw.pokemon.search, "pinsir", lang="xx"), ValidationError)


def test_one_piece_and_the_games_take_no_lang_and_carry_no_languages(pw):
    assert isinstance(failure(pw.onepiece.search, "luffy", lang="it"), ValidationError)
    assert pw.onepiece.search("luffy", limit=1).items[0].languages == {}
    assert pw.games.mtg.search("black lotus", limit=1).items[0].languages == {}


def test_no_internal_field_leaves_the_api_with_lang(pw, sample):
    page = pw.pokemon.search("pinsir ethan", lang="it", limit=3)
    card = pw.pokemon.card(sample.id, lang="it")
    assert internal_fields([[c.raw for c in page.items], card.raw]) == []
