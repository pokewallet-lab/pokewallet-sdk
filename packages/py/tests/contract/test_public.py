import pytest

from pokewallet import GAME_CODES, PokeWallet, ValidationError


def test_health_and_list_games_answer_without_a_key(monkeypatch):
    """Needs no key: runs even when POKEWALLET_API_KEY is unset, and ignores it when set."""
    monkeypatch.delenv("POKEWALLET_API_KEY", raising=False)
    with PokeWallet() as pw:
        health = pw.health()
        assert health.status == "healthy" and health.checks["database"].status == "healthy"
        assert health.version and isinstance(health.response_time, float)
        games = pw.list_games()
        assert len(games) == 10
        mtg = next(g for g in games if g.code == "mtg")
        assert mtg.name == "Magic: the Gathering" and mtg.endpoints["search"] == "/mtg/search?q="
        assert mtg.pro_endpoints["prices"] == "/mtg/prices/:set"
        assert sorted(g.code for g in games) == sorted(GAME_CODES)
        with pytest.raises(ValidationError):
            pw.pokemon.search("pikachu")
