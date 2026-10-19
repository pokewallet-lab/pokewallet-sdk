import asyncio

from pokewallet import Game, Health, UnavailableError

from ..conftest import failure, fixture, mock


def test_list_games_returns_typed_games_not_the_raw_envelope():
    games = mock({"body": fixture("games")}).client().list_games()
    assert isinstance(games, list) and len(games) == 10 and all(isinstance(g, Game) for g in games)
    assert [g.code for g in games] == ["mtg", "ygo", "cfv", "dbs", "fab", "dgm", "swu", "lor", "rft", "cpk"]
    mtg = games[0]
    assert mtg.name == "Magic: the Gathering"
    assert mtg.endpoints["search"] == "/mtg/search?q=" and mtg.endpoints["sets"] == "/mtg/sets"
    assert mtg.pro_endpoints["prices"] == "/mtg/prices/:set" and mtg.pro_endpoints["top_cards"] == "/mtg/analytics/top-cards"
    assert mtg.raw["pro_endpoints"]["trending"] == "/mtg/sets/trending"


def test_unknown_game_codes_are_skipped():
    body = fixture("games")
    body["data"].append({"code": "zzz", "name": "Future game", "endpoints": {}, "pro_endpoints": {}})
    assert len(mock({"body": body}).client().list_games()) == 10


def test_health_returns_a_typed_report():
    h = mock({"body": fixture("health")}).client().health()
    assert isinstance(h, Health)
    assert (h.status, h.version, h.region, h.response_time) == ("healthy", "1.7.1", "MXP", 82.0)
    assert (h.checks["database"].status, h.checks["database"].message, h.checks["database"].response_time) == ("healthy", None, 78.0)
    assert sorted(h.checks) == ["cache", "database", "storage"]
    assert h.raw["status"] == "healthy"


def test_an_unhealthy_503_report_is_data_and_is_not_retried():
    m = mock({"status": 503, "body": fixture("health-unhealthy")})
    h = m.client().health()
    assert h.status == "unhealthy"
    assert (h.checks["database"].status, h.checks["database"].message) == ("unhealthy", "Connection failed")
    assert "Critical services" in h.message
    assert len(m.calls) == 1


def test_a_503_without_a_report_is_still_unavailable_and_retried():
    m = mock({"status": 503, "headers": {"retry-after": "5"}, "body": {"error": "Temporarily unavailable"}})
    assert isinstance(failure(m.client().health), UnavailableError)
    assert len(m.calls) == 3
    assert isinstance(failure(mock({"status": 503}).client().health), UnavailableError)


def test_async_versions_return_the_same_types():
    async def go():
        m = mock({"body": fixture("games")}, {"status": 503, "body": fixture("health-unhealthy")})
        async with m.aclient("") as pw:
            return await pw.list_games(), await pw.health()

    games, health = asyncio.run(go())
    assert len(games) == 10 and health.status == "unhealthy"
