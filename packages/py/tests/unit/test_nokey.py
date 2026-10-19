import asyncio

import pytest

from pokewallet import PokeWallet, ValidationError

from ..conftest import TEST_KEY, failure, fixture, mock

MESSAGE = "An API key is required: pass apiKey or set POKEWALLET_API_KEY"


@pytest.fixture(autouse=True)
def no_env_key(monkeypatch):
    monkeypatch.delenv("POKEWALLET_API_KEY", raising=False)


def test_constructs_without_a_key_and_masks_itself():
    m = mock({"body": {}})
    pw = m.client("")
    assert "api_key=None" in repr(pw)


def test_health_and_list_games_work_without_the_auth_header():
    m = mock({"body": fixture("health")}, {"body": fixture("games")})
    pw = m.client("")
    assert pw.health().status == "healthy"
    assert "mtg" in [g.code for g in pw.list_games()]
    assert [c["url"] for c in m.calls] == ["https://api.pokewallet.io/health", "https://api.pokewallet.io/games"]
    for c in m.calls:
        assert "x-api-key" not in c["headers"]
        assert c["headers"]["user-agent"].startswith("pokewallet-sdk-py/")


def test_every_other_method_raises_before_any_request():
    m = mock({"body": fixture("pokemon-search")})
    pw = m.client("")
    calls = [
        lambda: pw.pokemon.search("pikachu"),
        lambda: pw.pokemon.card("pk_x"),
        lambda: pw.pokemon.sets(),
        lambda: pw.pokemon.price_history("pk_x"),
        lambda: pw.onepiece.search("luffy"),
        lambda: pw.onepiece.prices("OP01"),
        lambda: pw.games.mtg.set("FRA"),
        lambda: pw.games.ygo.top_cards(),
    ]
    for call in calls:
        e = failure(call)
        assert isinstance(e, ValidationError) and str(e) == MESSAGE
    assert m.calls == []


def test_header_is_still_sent_on_public_endpoints_when_a_key_is_set():
    m = mock({"body": {}})
    m.client(TEST_KEY).health()
    assert m.calls[0]["headers"]["x-api-key"] == TEST_KEY


def test_blank_key_counts_as_no_key():
    m = mock({"body": {}})
    e = failure(m.client("   ").pokemon.sets)
    assert isinstance(e, ValidationError) and m.calls == []


def test_async_client_behaves_the_same():
    async def go():
        m = mock({"body": fixture("health")})
        apw = m.aclient("")
        health = (await apw.health()).status
        try:
            await apw.pokemon.search("pikachu")
        except ValidationError as e:
            msg = str(e)
        await apw.aclose()
        return health, msg, m

    health, msg, m = asyncio.run(go())
    assert health == "healthy" and msg == MESSAGE
    assert len(m.calls) == 1 and "x-api-key" not in m.calls[0]["headers"]
