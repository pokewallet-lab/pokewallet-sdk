import pytest

from pokewallet import AmbiguousSetError, BadRequestError, NotFoundError, ValidationError

from ..conftest import failure

_state = {}


def test_search_pagination_normalized_card_and_wire_price_types(pw):
    page = pw.pokemon.search("charizard", limit=3)
    assert len(page.items) == 3 and page.limit == 3
    assert page.total_pages == -(-page.total // 3)
    sample = _state["sample"] = page.items[0]
    assert sample.id.startswith("pk_") and sample.set_code
    assert sample.set_id.lstrip("-").isdigit()
    p = sample.tcgplayer.prices[0]
    # What the wire carries: numbers (or null) for per-card prices.
    assert isinstance(p.raw["market_price"], (int, float, type(None)))
    assert p.market is None or isinstance(p.market, float)
    assert pw.last_rate_limit.limit_hour > 0


def test_card_matches_the_search_hit(pw):
    s = _state["sample"]
    card = pw.pokemon.card(s.id)
    assert (card.id, card.name, card.set_code) == (s.id, s.name, s.set_code)


def test_sets_and_listing_hide_the_set_code_difference(pw):
    assert len(pw.pokemon.sets(language="eng")) > 100
    page = pw.pokemon.set("PLF", limit=3)
    assert (page.set.code, page.set.id) == ("PLF", "1382")
    assert page.items[0].set_code == "PLF"
    assert page.items[0].raw["card_info"]["set_code"] == "1382"  # the raw listing keeps the original value


def test_ambiguous_set_is_one_error_across_200_300_409(pw):
    a = failure(pw.pokemon.set, "PR")
    assert isinstance(a, AmbiguousSetError) and len(a.matches) > 1
    assert a.matches[0].set_id.lstrip("-").isdigit()
    b = failure(pw.pokemon.prices, "PR")
    assert isinstance(b, AmbiguousSetError) and b.status == 300
    c = failure(pw.pokemon.statistics, "PR")
    assert isinstance(c, AmbiguousSetError) and c.status == 409
    assert len(pw.pokemon.set(a.matches[0].set_id, limit=1).items) == 1


def test_statistics_and_completion_value(pw):
    s = pw.pokemon.statistics("PLF")
    assert isinstance(s.tcgplayer.avg, float)
    assert isinstance(s.raw["price_statistics"]["tcgplayer"]["avg_market_price"], str)  # a string on the wire
    c = pw.pokemon.completion_value("PLF")
    assert c.tcgplayer.currency == "USD" and c.set.code == "PLF"


def test_trending_and_top_cards(pw):
    t7 = pw.pokemon.trending(limit=3)
    assert t7 and isinstance(t7[0].change_pct, float)
    assert pw.pokemon.trending(period="30d", limit=3)
    assert isinstance(pw.pokemon.top_cards(limit=3)[0].price, float)
    assert pw.pokemon.top_cards(metric="growth", limit=3)[0].change_7d.endswith("%")


def test_price_history(pw):
    h = pw.pokemon.price_history(_state["sample"].id)
    assert len(h.tcgplayer or h.cardmarket or {}) > 0



def test_errors_and_local_validation(pw):
    assert isinstance(failure(pw.pokemon.set, "ZZZZNOSUCHSET"), NotFoundError)
    assert isinstance(failure(pw.pokemon.card, "pk_not-a-real-id"), BadRequestError)
    with pytest.raises(ValidationError):
        pw.pokemon.search("pikachu", limit=-1)
