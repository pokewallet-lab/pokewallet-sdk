from pokewallet import NotFoundError, ValidationError

from ..conftest import failure, internal_fields

_state = {}


def test_search_hides_the_flat_pagination(pw):
    page = pw.onepiece.search("luffy", limit=3)
    assert len(page.items) == 3 and page.total_pages == -(-page.total // 3)
    s = _state["sample"] = page.items[0]
    assert s.id.startswith("op_") and len(s.tcgplayer.prices if s.tcgplayer else []) <= 1
    assert "card_info" not in s.raw  # the raw payload is flat


def test_card_and_sets(pw):
    assert pw.onepiece.card(_state["sample"].id).id == _state["sample"].id
    sets = pw.onepiece.sets(language="en")
    assert any(s.code == "OP01" for s in sets) and sets[0].id.lstrip("-").isdigit()


def test_set_listing_carries_group_id_identity(pw):
    page = pw.onepiece.set("OP01", limit=3)
    assert (page.set.code, page.set.id) == ("OP01", "3188")
    assert (page.items[0].set_id, page.items[0].set_code) == ("3188", "OP01")
    assert page.total > 100


def test_prices_statistics_completion(pw):
    prices = pw.onepiece.prices("OP01")
    assert len(prices.rows) > 100 and prices.set_id == "3188"
    assert pw.onepiece.prices("3188").total == prices.total
    assert prices.set_code == "OP01" and prices.rows[0].product_type
    stats = pw.onepiece.statistics("OP01")
    assert (stats.set.id, stats.set.code) == ("3188", "OP01")
    # Statistics skip sealed products and count a card once. A few cards have a Normal and a Foil row sharing one id.
    ids = len({r.id for r in prices.rows if r.product_type != "sealed"})
    assert ids <= stats.set.total_cards <= len(prices.rows)
    assert stats.cardmarket.most_expensive.id.startswith("op_")
    assert pw.onepiece.completion_value("OP01").cardmarket.currency == "EUR"


def test_trending_and_top_cards(pw):
    assert pw.onepiece.trending(limit=3)
    assert isinstance(failure(pw.onepiece.trending, period="30d"), ValidationError)
    assert pw.onepiece.top_cards(limit=3)[0].id.startswith("op_")
    assert pw.onepiece.top_cards(metric="growth", source="cm", limit=3)[0].change_7d.endswith("%")


def test_unknown_set_is_not_found(pw):
    assert isinstance(failure(pw.onepiece.set, "NOSUCHSET99"), NotFoundError)


def test_en_sets_carry_cardmarket_prices_and_no_internal_field(pw):
    page = pw.onepiece.search("cavendish", limit=20)
    assert any(c.cardmarket and c.cardmarket.prices for c in page.items)
    prices = pw.onepiece.prices("OP01")
    assert all(r.product_type for r in prices.rows)
    card = pw.onepiece.card(page.items[0].id)
    for a in ([c.raw for c in page.items], card.raw, prices.raw):
        assert internal_fields(a) == []
