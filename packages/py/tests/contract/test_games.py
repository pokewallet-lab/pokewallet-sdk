import pytest

from pokewallet import GAME_CODES, AmbiguousSetError, NotFoundError, ValidationError

from ..conftest import failure


def test_games_endpoint_lists_the_codes_the_sdk_knows(pw):
    games = pw.list_games()
    assert len(games) == 10 and sorted(g.code for g in games) == sorted(GAME_CODES)


@pytest.mark.parametrize("code", GAME_CODES)
def test_search_answers_through_the_unified_interface(pw, code):
    page = pw.game(code).search("dragon", limit=1)
    assert len(page.items) <= 1
    if page.items:
        i = page.items[0].id
        assert i.startswith(code + "_") or (len(i) == 64 and all(c in "0123456789abcdef" for c in i))


def test_mtg_set_listing_and_card_and_user_agent_is_accepted(pw):
    page = pw.games.mtg.set("FRA", limit=3)
    assert page.set.code == "FRA" and len(page.items) == 3
    card = pw.games.mtg.card(page.items[0].id)
    assert card.id == page.items[0].id and "sub_type" in card.info


def test_mtg_ambiguous_set_is_200_on_listing_and_409_on_pro_route(pw):
    a = failure(pw.games.mtg.set, "MOC")
    assert isinstance(a, AmbiguousSetError) and len(a.matches) > 1
    b = failure(pw.games.mtg.statistics, "MOC")
    assert isinstance(b, AmbiguousSetError) and b.status == 409


def test_mtg_pro_endpoints(pw):
    s = pw.games.mtg.statistics("FRA")
    assert (s.set.code, s.set.id) == ("FRA", "24684")
    assert s.set.total_cards == len({r.id for r in pw.games.mtg.prices("FRA").rows if r.product_type != "sealed"})
    assert pw.games.mtg.trending(limit=3)
    assert isinstance(failure(pw.games.mtg.trending, period="30d"), ValidationError)
    assert pw.games.mtg.top_cards(metric="growth", source="cm", limit=3)


def test_mtg_unknown_set_is_not_found(pw):
    assert isinstance(failure(pw.games.mtg.set, "NOSUCHSETZZ"), NotFoundError)
