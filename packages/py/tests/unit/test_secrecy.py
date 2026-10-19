import asyncio
import copy
import dataclasses
import io
import logging
import pickle
import pprint
import traceback

import httpx
import pytest

from pokewallet import AsyncPokeWallet, NetworkError, PokeWallet

from ..conftest import SECRET, failure, mock


def renderings(value):
    return [
        repr(value), str(value), f"{value}", f"{value!r}", pprint.pformat(value), "%s %r" % (value, value),
        *([str(vars(value))] if hasattr(value, "__dict__") else []),
    ]


def tb(exc):
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))


def all_attr_text(obj, depth=0):
    """Every attribute reachable through vars()/slots, rendered, to prove the key is not stored as text."""
    out = []
    for name in list(getattr(obj, "__dict__", {})) + list(getattr(type(obj), "__slots__", ())):
        try:
            v = getattr(obj, name)
        except AttributeError:
            continue
        out.append(repr(v))
        if depth < 3 and hasattr(v, "__dict__") and not isinstance(v, (httpx.Client, httpx.AsyncClient)):
            out.extend(all_attr_text(v, depth + 1))
    return out


@pytest.fixture
def clients():
    m = mock({"body": {}})
    return m, m.client(SECRET), m.aclient(SECRET)


def test_repr_str_and_dumps_never_contain_the_key(clients):
    _, pw, apw = clients
    for obj in (pw, apw, pw.pokemon, pw.games.mtg, apw.pokemon, pw._core, pw._core.credentials):
        for text in renderings(obj):
            assert SECRET not in text
    assert "pk_***" in repr(pw) and "pk_***" in repr(apw)


def test_the_key_is_not_stored_as_attribute_text(clients):
    _, pw, apw = clients
    for obj in (pw, apw, pw._core, pw._core.credentials, pw._t):
        assert not any(SECRET in t for t in all_attr_text(obj))
    assert not hasattr(pw._core, "api_key") and not hasattr(pw._core, "key")


def test_clients_cannot_be_pickled_or_copied(clients):
    _, pw, apw = clients
    for obj in (pw, apw, pw._core.credentials):
        with pytest.raises(TypeError):
            pickle.dumps(obj)
        with pytest.raises(TypeError):
            copy.copy(obj)
        with pytest.raises(TypeError):
            copy.deepcopy(obj)


def test_credentials_are_read_only(clients):
    with pytest.raises(AttributeError):
        clients[1]._core.credentials._get = lambda: "x"


def test_still_authenticates_requests_with_the_key(clients):
    m, pw, _ = clients
    pw.health()
    assert m.calls[0]["headers"]["x-api-key"] == SECRET


def test_server_echoing_the_key_in_an_error_body_is_redacted():
    m = mock({"status": 401, "body": {"error": "Authentication failed", "message": f"bad key {SECRET}", "example": SECRET}})
    e = failure(m.client(SECRET).pokemon.sets)
    for text in (repr(e), str(e), tb(e), repr(e.body), str(e.args)):
        assert SECRET not in text
    assert "pk_***" in repr(e.body)


def test_server_echoing_the_key_in_a_success_body_is_redacted_from_raw():
    m = mock({"body": {"id": "pk_x", "card_info": {"name": f"leak {SECRET}"}}})
    card = m.client(SECRET).pokemon.card("pk_x")
    assert SECRET not in repr(card) and SECRET not in repr(card.raw) and SECRET not in repr(dataclasses.asdict(card))


def test_network_failure_mentioning_the_key_leaves_no_trace_anywhere():
    def boom(request):
        raise httpx.ConnectError(f"connect failed, headers: X-API-Key={SECRET}", request=request)

    pw = PokeWallet(SECRET, transport=httpx.MockTransport(boom))
    exc = failure(pw.health)
    assert isinstance(exc, NetworkError)
    for text in (repr(exc), str(exc), tb(exc), str(exc.args)):
        assert SECRET not in text
    # No chained exception can lead back to the original request headers.
    assert exc.__cause__ is None and exc.__context__ is None


def test_async_network_failure_is_scrubbed_too():
    def boom(request):
        raise httpx.ReadTimeout(f"timeout {SECRET}", request=request)

    async def go():
        apw = AsyncPokeWallet(SECRET, transport=httpx.MockTransport(boom))
        try:
            await apw.health()
        except NetworkError as e:
            return e

    exc = asyncio.run(go())
    assert SECRET not in tb(exc) and SECRET not in repr(exc) and exc.__context__ is None


def test_logging_at_debug_level_does_not_print_the_key(caplog):
    m = mock({"body": {}})
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    try:
        m.client(SECRET).pokemon.search("pikachu")
    finally:
        root.removeHandler(handler)
    assert SECRET not in stream.getvalue() and SECRET not in caplog.text


def test_validation_errors_about_the_key_do_not_repeat_it():
    e = failure(PokeWallet, "FAKEKEY_without_prefix")
    assert "FAKEKEY" not in str(e) and "FAKEKEY" not in tb(e)
