import pytest

from pokewallet import AmbiguousSetError, FeatureNotEnabledError, ValidationError, image_url

from ..conftest import failure, fixture, mock


def test_pokemon_search_normalizes_and_computes_total_pages():
    m = mock({"body": fixture("pokemon-search")})
    page = m.client().pokemon.search("weedle", limit=3)
    assert m.calls[0]["url"] == "https://api.pokewallet.io/search?q=weedle&limit=3"
    assert (page.page, page.limit, page.total, page.total_pages, page.truncated) == (1, 3, 66, 22, False)
    c = page.items[0]
    assert c.id.startswith("pk_") and c.set_code == "BS2" and c.set_id == "605"
    assert isinstance(c.tcgplayer.prices[0].market, float) and c.tcgplayer.prices[0].variant == "Normal"
    assert c.cardmarket.prices[0].variant == "normal"
    assert "hp" in c.info and isinstance(c.raw, dict)


def test_set_pair_comes_from_the_set_object_in_a_listing():
    body = fixture("pokemon-set")
    assert body["cards"][0]["card_info"]["set_code"] == "1382"  # the difference the SDK hides
    page = mock({"body": body}).client().pokemon.set("PLF", limit=3)
    assert (page.set.id, page.set.code, page.set.name) == ("1382", "PLF", "Plasma Freeze")
    assert all(c.set_id == "1382" and c.set_code == "PLF" for c in page.items)
    assert page.total_pages == 43


def test_200_disambiguation_raises_ambiguous_set_error():
    e = failure(mock({"body": fixture("pokemon-set-ambiguous")}).client().pokemon.set, "PR")
    assert isinstance(e, AmbiguousSetError)
    assert (e.matches[0].set_id, e.matches[0].set_code, e.matches[0].language) == ("1938", "PR", "eng")


def test_lists_sets_and_passes_set_code_for_plain_numbers():
    sets = mock({"body": fixture("pokemon-sets")}).client().pokemon.sets(language="jap")
    assert (sets[0].id, sets[0].code, sets[0].language, sets[0].card_count) == ("24146", "10M", "jap", 11)
    m = mock({"body": fixture("pokemon-card")})
    card = m.client().pokemon.card("086/078", set_code="SV8a")
    assert m.calls[0]["url"] == "https://api.pokewallet.io/cards/086%2F078?set_code=SV8a"
    assert card.name == "Weedle"


def test_numeric_strings_become_numbers_and_raw_is_kept():
    body = fixture("pokemon-card")
    body["tcgplayer"]["prices"][0]["market_price"] = "1.50"
    body["tcgplayer"]["prices"][0]["low_price"] = "n/a"
    p = mock({"body": body}).client().pokemon.card("pk_x").tcgplayer.prices[0]
    assert p.market == 1.5 and p.low is None and p.raw["market_price"] == "1.50"


def test_statistics_string_averages_and_numeric_set_code():
    s = mock({"body": fixture("pokemon-statistics")}).client().pokemon.statistics("PLF")
    assert (s.set.id, s.set.code, s.set.name, s.set.total_cards) == ("1382", None, "Plasma Freeze", 222)
    assert s.tcgplayer.avg == 25.92
    assert (s.tcgplayer.most_expensive.name, s.tcgplayer.most_expensive.price) == ("Ultra Ball", 1199.51)
    assert s.cardmarket.trend_direction == "up" and s.rarity_breakdown["Common"] == 64
    assert s.raw["price_statistics"]["tcgplayer"]["avg_market_price"] == "25.92"


def test_completion_trending_top_cards_history():
    c = mock({"body": fixture("pokemon-completion")}).client().pokemon.completion_value("PLF")
    assert c.set.code == "PLF" and c.tcgplayer.currency == "USD" and c.tcgplayer.market == 5754.3
    assert (c.by_rarity["Common"].count, c.by_rarity["Common"].total_cost) == (64, 125.93)

    t = mock({"body": fixture("pokemon-trending")}).client().pokemon.trending(period="30d")
    assert (t[0].change, t[0].change_pct, t[0].card_count) == ("+446.7%", 446.7, 4)
    assert (t[0].set.id, t[0].set.code) == ("24002", None)

    top = mock({"body": fixture("pokemon-top-growth")}).client().pokemon.top_cards(metric="growth")
    assert (top[0].price, top[0].previous_price_7d, top[0].change_7d) == (1.43, 1.37, "+4.4%")

    h = mock({"body": fixture("pokemon-price-history")}).client().pokemon.price_history("pk_x")
    assert h.tcgplayer["Normal"].price[7] == 0.37 and h.tcgplayer["Normal"].change[30] == "+12.5%"
    assert h.cardmarket["holo"].current["trend"] == 0.8


def test_set_prices_for_pokemon_and_games():
    p = mock({"body": fixture("pokemon-prices")}).client().pokemon.prices("PLF", source="tcg")
    assert (p.set_id, p.set_code, p.source, p.total) == ("1382", "PLF", "both", 227)
    assert p.rows[0].tcgplayer.market == 0.36 and p.rows[0].variant == "Normal"
    g = mock({"body": fixture("mtg-prices")}).client().games.mtg.prices("FRA")
    assert g.set_id == "24684" and g.rows[0].cardmarket.trend == 16.27


def test_one_piece_flat_shape_and_set_identity():
    m = mock({"body": fixture("op-search")})
    page = m.client().onepiece.search("cavendish", limit=3)
    assert m.calls[0]["url"] == "https://api.pokewallet.io/op/search?q=cavendish&limit=3"
    assert (page.page, page.limit, page.total, page.total_pages) == (1, 3, 192, 64)
    c = page.items[0]
    assert c.id.startswith("op_") and c.rarity == "SR" and c.info["ext_color"] == "Green" and c.set_id is None
    assert len(c.tcgplayer.prices) == 1 and c.tcgplayer.prices[0].market == 0.73 and c.tcgplayer.prices[0].variant == "Normal"

    s = mock({"body": fixture("op-set")}).client().onepiece.set("OP01", limit=3)
    assert (s.set.id, s.set.code, s.set.name, s.total) == ("3188", "OP01", "Romance Dawn", 159)
    assert (s.items[0].set_id, s.items[0].set_code, s.items[0].number) == ("3188", "OP01", "OP01-001")


def test_one_piece_prices_go_in_the_query():
    m = mock({"body": fixture("op-prices")})
    res = m.client().onepiece.prices("OP01")
    assert m.calls[0]["url"] == "https://api.pokewallet.io/op/prices?set_code=OP01" and res.set_id == "3188"
    m = mock({"body": fixture("op-prices")})
    m.client().onepiece.prices("-3")
    assert m.calls[0]["url"] == "https://api.pokewallet.io/op/prices?group_id=-3"


def test_one_piece_sets_statistics_trending_top_cards():
    pw = mock({"body": fixture("op-sets")}).client()
    s = pw.onepiece.sets()[0]
    assert (s.id, s.code, s.language) == ("-3", "OP01-JP", "jp")
    m = mock({"body": fixture("op-statistics")})
    st = m.client().onepiece.statistics("OP01")
    assert m.calls[0]["url"] == "https://api.pokewallet.io/op/sets/OP01/statistics"
    assert st.set.id == "3188" and st.cardmarket.most_expensive.id.startswith("op_")
    assert mock({"body": fixture("op-trending")}).client().onepiece.trending()[0].set.id == "-7"
    top = mock({"body": fixture("op-top-cards")}).client().onepiece.top_cards()[0]
    assert (top.price, top.set_code, top.set_id) == (13000, "OP11", "24241")


def test_one_piece_refuses_what_it_does_not_have():
    m = mock({"body": {}})
    pw = m.client()
    assert isinstance(failure(pw.onepiece.trending, period="30d"), ValidationError)
    assert isinstance(failure(pw.onepiece.prices, "OP01", source="tcg"), ValidationError)
    assert m.calls == []


def test_games_route_under_prefix_and_expose_truncated():
    body = fixture("mtg-search")
    body["metadata"]["truncated"] = True
    m = mock({"body": body})
    page = m.client().games.mtg.search("Emrakul")
    assert m.calls[0]["url"] == "https://api.pokewallet.io/mtg/search?q=Emrakul"
    assert page.truncated is True and page.items[0].info["p"] == "15"


def test_games_set_listing_and_disambiguation():
    page = mock({"body": fixture("mtg-set")}).client().games.mtg.set("FRA", limit=3)
    assert (page.set.id, page.set.code, page.total_pages) == ("24684", "FRA", 261)
    e = failure(mock({"body": fixture("mtg-set-ambiguous")}).client().games.mtg.set, "MOC")
    assert isinstance(e, AmbiguousSetError) and len(e.matches) > 1


def test_games_runtime_code_and_early_validation():
    m = mock({"body": fixture("mtg-card")})
    m.client().game("mtg").card("mtg_abc")
    assert m.calls[0]["url"] == "https://api.pokewallet.io/mtg/cards/mtg_abc"
    m = mock({"body": {}})
    pw = m.client()
    assert isinstance(failure(pw.games.ygo.search, "a"), ValidationError)
    assert isinstance(failure(pw.games.ygo.trending, period="30d"), ValidationError)
    assert m.calls == []


@pytest.mark.parametrize("call", [
    lambda pw: pw.pokemon.search("x", limit=0),
    lambda pw: pw.pokemon.search("x", limit=-1),
    lambda pw: pw.pokemon.search("x", limit=101),
    lambda pw: pw.pokemon.set("PLF", limit=201),
    lambda pw: pw.onepiece.search("x", limit=2.5),
    lambda pw: pw.games.mtg.search("xx", page=0),
    lambda pw: pw.pokemon.card("  "),
    lambda pw: pw.pokemon.trending(limit=51),
    lambda pw: pw.pokemon.search("x", limit=True),
])
def test_client_side_validation_sends_nothing(call):
    m = mock({"body": {}})
    assert isinstance(failure(call, m.client()), ValidationError)
    assert m.calls == []


def _pages(total, limit, per_page):
    base = fixture("pokemon-set")
    pages = -(-total // limit)
    return [
        {"body": {**base, "cards": base["cards"][: per_page(p)], "pagination": {"page": p, "limit": limit, "total": total, "total_pages": pages}}}
        for p in range(1, pages + 1)
    ]


def test_set_cards_walks_every_page():
    m = mock(*_pages(5, 2, lambda p: 1 if p == 3 else 2))
    got = list(m.client().pokemon.set_cards("PLF", limit=2))
    assert len(got) == 5
    assert [c["url"].split("page=")[1].split("&")[0] for c in m.calls] == ["1", "2", "3"]


def test_one_piece_iteration_honors_max_items():
    base = fixture("op-search")
    m = mock(*[{"body": {**base, "data": base["data"][:2], "page": p, "limit": 2, "total": 6}} for p in (1, 2, 3)])
    assert len(list(m.client().onepiece.search_all("x", limit=2, max_items=3))) == 3
    assert len(m.calls) == 2


def test_iteration_stops_on_an_empty_page_even_if_total_pages_lies():
    base = fixture("pokemon-search")
    m = mock({"body": {**base, "results": [], "pagination": {"page": 1, "limit": 3, "total": 99, "total_pages": None}}})
    assert list(m.client().pokemon.search_all("x")) == [] and len(m.calls) == 1


def test_image_urls_are_pure_strings():
    m = mock({"body": {}})
    pw = m.client()
    assert pw.image_url("pk_abc", size="high") == "https://api.pokewallet.io/images/pk_abc?size=high"
    assert pw.image_url("op_abc") == "https://api.pokewallet.io/images/op_abc"
    assert image_url("mtg_abc") == "https://api.pokewallet.io/mtg/images/mtg_abc"
    assert m.calls == []


def test_exposes_the_quota_of_the_last_call_and_keeps_versions_in_step():
    m = mock({"body": fixture("pokemon-card"), "headers": {"x-ratelimit-remaining-hour": "99", "x-ratelimit-limit-hour": "100"}})
    pw = m.client()
    assert pw.last_rate_limit is None
    pw.pokemon.card("pk_x")
    assert (pw.last_rate_limit.limit_hour, pw.last_rate_limit.remaining_hour) == (100, 99)
    import re
    from pathlib import Path
    import pokewallet

    toml = (Path(__file__).resolve().parents[2] / "pyproject.toml").read_text()
    assert re.search(r'^version = "%s"$' % re.escape(pokewallet.__version__), toml, re.M)
