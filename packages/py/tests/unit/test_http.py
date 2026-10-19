import pytest

from pokewallet import (
    AmbiguousSetError, AuthError, BadRequestError, FeatureNotEnabledError, NetworkError, NotFoundError,
    PlanRequiredError, PokeWallet, RateLimitError, ServerError, UnavailableError, ValidationError,
)
from pokewallet._core import parse_retry_after
from pokewallet.errors import GameUnavailableError

from ..conftest import TEST_KEY, failure, mock


def get(pw, path="/search"):
    return pw._t.get(path)


def limits(remaining):
    return {"hourly": {"limit": 100, "used": 100 - remaining, "remaining": remaining}, "daily": {"limit": 1000, "used": 10, "remaining": 990}}


def test_sends_key_and_own_user_agent_and_skips_empty_query():
    m = mock({"body": {"ok": True}})
    m.client().pokemon.search("pikachu", limit=5)
    call = m.calls[0]
    assert call["url"] == "https://api.pokewallet.io/search?q=pikachu&limit=5"
    assert call["headers"]["x-api-key"] == TEST_KEY
    assert call["headers"]["user-agent"].startswith("pokewallet-sdk-py/")


def test_rejects_a_malformed_key_but_allows_a_missing_one(monkeypatch):
    monkeypatch.delenv("POKEWALLET_API_KEY", raising=False)
    with pytest.raises(ValidationError, match="pk_"):
        PokeWallet("abc")
    PokeWallet("")  # no key is fine at construction


def test_reads_the_key_from_the_environment(monkeypatch):
    monkeypatch.setenv("POKEWALLET_API_KEY", TEST_KEY)
    assert PokeWallet().last_rate_limit is None


def test_records_quota_headers():
    m = mock({"body": {}, "headers": {"x-ratelimit-limit-hour": "7000", "x-ratelimit-remaining-hour": "6990", "x-ratelimit-limit-day": "70000", "x-ratelimit-remaining-day": "69990"}})
    pw = m.client()
    pw.health()
    assert (pw.last_rate_limit.limit_hour, pw.last_rate_limit.remaining_day) == (7000, 69990)


def test_network_error_is_not_retried():
    import httpx

    calls = []

    def boom(request):
        calls.append(1)
        raise httpx.ConnectError("connection refused")

    pw = PokeWallet(TEST_KEY, transport=httpx.MockTransport(boom))
    exc = failure(pw.health)
    assert isinstance(exc, NetworkError) and len(calls) == 1
    assert exc.__cause__ is None and exc.__context__ is None


def test_maps_401_400_and_5xx_without_retrying():
    for status, cls in ((401, AuthError), (400, BadRequestError), (500, ServerError)):
        m = mock({"status": status, "body": {"error": "x"}})
        assert isinstance(failure(m.client().health), cls)
        assert len(m.calls) == 1


def test_maps_403_variants_with_their_links():
    m = mock({"status": 403, "body": {"error": "Trial not activated", "redeem_url": "https://pokewallet.io/dashboard"}})
    e = failure(m.client().pokemon.trending)
    assert isinstance(e, PlanRequiredError) and e.redeem_url == "https://pokewallet.io/dashboard"

    m = mock({"status": 403, "body": {"error": "Pro plan required", "upgrade_url": "https://pokewallet.io/pricing"}})
    assert failure(m.client().pokemon.trending).upgrade_url == "https://pokewallet.io/pricing"

    m = mock({"status": 403, "body": {"error": "Feature not enabled", "message": "This account does not have access to this feature.", "contact_url": "https://pokewallet.io/contact"}})
    e = failure(m.client().pokemon.sets)
    assert isinstance(e, FeatureNotEnabledError) and e.contact_url == "https://pokewallet.io/contact"


def test_maps_404_with_suggestions_and_game_route_404():
    m = mock({"status": 404, "body": {"error": "Set not found", "suggestions": [{"set_id": "1"}], "did_you_mean": "/x"}})
    e = failure(m.client().games.mtg.set, "zzz")
    assert type(e) is NotFoundError and len(e.suggestions) == 1 and e.did_you_mean == "/x"
    m = mock({"status": 404, "body": {"error": "Endpoint not found"}})
    assert isinstance(failure(m.client().games.mtg.sets), GameUnavailableError)


def test_unifies_300_and_409_ambiguity():
    matches = [{"set_id": "1938", "set_code": "PR", "name": "Alternate Art Promos", "language": "eng", "release_date": None}]
    m = mock({"status": 300, "body": {"disambiguation": True, "matches": matches, "total": 1}})
    e = failure(m.client().pokemon.prices, "PR")
    assert isinstance(e, AmbiguousSetError) and e.matches[0].set_id == "1938" and e.matches[0].language == "eng"
    m = mock({"status": 409, "body": {"error": "Ambiguous set code", "message": "m", "matches": matches}})
    e = failure(m.client().pokemon.statistics, "PR")
    assert isinstance(e, AmbiguousSetError) and e.status == 409


def test_retries_429_with_retry_after_within_cap():
    m = mock({"status": 429, "headers": {"retry-after": "3"}, "body": {"error": "Rate limit exceeded", "limits": limits(5)}}, {"body": {"ok": 1}})
    assert get(m.client()) == {"ok": 1}
    assert len(m.calls) == 2 and m.sleeps == [3.0]


def test_never_guesses_a_wait_for_429_without_retry_after():
    m = mock({"status": 429, "body": {"error": "Rate limit exceeded", "limits": limits(0)}})
    e = failure(get, m.client())
    assert isinstance(e, RateLimitError) and e.retry_after is None
    assert (e.hourly.limit, e.hourly.used, e.hourly.remaining) == (100, 100, 0)
    assert len(m.calls) == 1 and m.sleeps == []


def test_no_retry_when_a_window_is_exhausted_or_header_above_cap():
    m = mock({"status": 429, "headers": {"retry-after": "2"}, "body": {"error": "x", "limits": limits(0)}})
    failure(get, m.client())
    assert len(m.calls) == 1
    m = mock({"status": 429, "headers": {"retry-after": "120"}, "body": {"error": "x", "limits": limits(5)}})
    e = failure(get, m.client())
    assert e.retry_after == 120 and len(m.calls) == 1
    m = mock({"status": 429, "headers": {"retry-after": "120"}, "body": {"limits": limits(5)}}, {"body": {}})
    get(m.client(retry_after_cap=300))
    assert len(m.calls) == 2


def test_retries_503_twice_then_raises():
    m = mock({"status": 503, "headers": {"retry-after": "5"}, "body": {"error": "Temporarily unavailable"}})
    e = failure(get, m.client())
    assert isinstance(e, UnavailableError) and e.retry_after == 5
    assert len(m.calls) == 3 and m.sleeps == [5.0, 5.0]


def test_503_recovers_and_503_for_an_hour_is_not_waited_out():
    m = mock({"status": 503, "headers": {"retry-after": "5"}, "body": {}}, {"body": {"ok": 1}})
    assert get(m.client()) == {"ok": 1} and len(m.calls) == 2
    m = mock({"status": 503, "headers": {"retry-after": "3600"}, "body": {"error": "Not available yet"}})
    e = failure(get, m.client())
    assert e.retry_after == 3600 and len(m.calls) == 1


def test_max_retries_is_honored():
    m = mock({"status": 503, "headers": {"retry-after": "1"}, "body": {}})
    failure(get, m.client(max_retries=0))
    assert len(m.calls) == 1


def test_parse_retry_after():
    assert parse_retry_after("5") == 5
    assert parse_retry_after(None) is None
    assert parse_retry_after("soon") is None
