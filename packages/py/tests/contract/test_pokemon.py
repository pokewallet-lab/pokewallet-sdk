import pytest

from pokewallet import AmbiguousSetError, BadRequestError, NotFoundError, ValidationError

from ..conftest import failure, internal_fields

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
    # Finishes are listed Normal first, then alphabetically; the search flags a capped candidate list.
    assert sample.variants
    for c in page.items:
        rest = [v for v in c.variants if v != "Normal"]
        assert "Normal" not in c.variants or c.variants[0] == "Normal"
        assert rest == sorted(rest)
    assert isinstance(page.truncated, bool)


def test_no_internal_field_leaves_the_api(pw):
    s = _state["sample"]
    answers = [
        s.raw,
        pw.pokemon.card(s.id).raw,
        [c.raw for c in pw.pokemon.set("PLF", limit=2).items],
        pw.pokemon.prices("PLF").raw,
        pw.pokemon.statistics("PLF").raw,
        pw.pokemon.completion_value("PLF").raw,
        [c.raw for c in pw.pokemon.top_cards(limit=3)],
        [t.raw for t in pw.pokemon.trending(limit=3)],
    ]
    for a in answers:
        assert internal_fields(a) == []


def test_card_matches_the_search_hit(pw):
    s = _state["sample"]
    card = pw.pokemon.card(s.id)
    assert (card.id, card.name, card.set_code) == (s.id, s.name, s.set_code)


def test_sets_and_listing_agree_on_the_set(pw):
    assert len(pw.pokemon.sets(language="eng")) > 100
    page = pw.pokemon.set("PLF", limit=3)
    assert (page.set.code, page.set.id) == ("PLF", "1382")
    assert page.items[0].set_code == "PLF"
    assert page.items[0].raw["card_info"]["set_code"] == "PLF" and page.items[0].raw["card_info"]["set_id"] == "1382"


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
    assert (s.set.code, s.set.id) == ("PLF", "1382") and s.tcgplayer.most_expensive.id.startswith("pk_")
    # "holo" is only a legacy alias on the wire: the SDK sends normal or foil.
    assert isinstance(failure(pw.pokemon.statistics, "PLF", variant="holo"), ValidationError)
    assert pw.pokemon.statistics("PLF", variant="foil").set.total_cards <= s.set.total_cards


def test_statistics_total_cards_equals_distinct_ids_in_prices(pw):
    s = pw.pokemon.statistics("PLF")
    prices = pw.pokemon.prices("PLF")
    assert prices.set_id == "1382" and prices.raw["group_id"] == prices.raw["set_id"]
    assert s.set.total_cards == len({r.id for r in prices.rows if r.product_type != "sealed"})


def test_trending_and_top_cards(pw):
    t7 = pw.pokemon.trending(limit=3)
    assert t7 and isinstance(t7[0].change_pct, float)
    assert t7[0].set.id
    assert isinstance(failure(pw.pokemon.trending, period="30d"), ValidationError)
    top = pw.pokemon.top_cards(limit=5)
    prices = [c.price for c in top]
    # Highest market price first: the first item is the most expensive TCG card.
    assert isinstance(prices[0], float) and prices == sorted(prices, reverse=True)
    assert top[0].raw["card_info"]["name"] == top[0].name and "previous_price_7d" not in top[0].raw
    assert pw.pokemon.card(top[0].id).id == top[0].id
    assert pw.pokemon.top_cards(metric="growth", limit=3)[0].change_7d.endswith("%")


def test_price_history(pw):
    h = pw.pokemon.price_history(_state["sample"].id)
    assert len(h.tcgplayer or h.cardmarket or {}) > 0



def test_gallery_sets_carry_cardmarket_prices_everywhere(pw):
    for code in ["CRZ:GG", "SWSH09:TG", "SWSH10:TG", "SWSH11: TG", "SWSH12: TG"]:
        prices = pw.pokemon.prices(code)
        assert prices.rows
        assert [r.id for r in prices.rows if r.cardmarket is None] == []
    listing = pw.pokemon.set("CRZ:GG", limit=3)
    assert all(c.cardmarket is not None for c in listing.items)
    assert pw.pokemon.card(listing.items[0].id).cardmarket is not None
    found = pw.pokemon.search("Eevee Crown Zenith", limit=5)
    assert found.items and all(c.cardmarket is not None for c in found.items)


def test_errors_and_local_validation(pw):
    assert isinstance(failure(pw.pokemon.set, "ZZZZNOSUCHSET"), NotFoundError)
    assert isinstance(failure(pw.pokemon.card, "pk_not-a-real-id"), BadRequestError)
    with pytest.raises(ValidationError):
        pw.pokemon.search("pikachu", limit=-1)
