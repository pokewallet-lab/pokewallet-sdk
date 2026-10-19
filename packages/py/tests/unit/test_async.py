import asyncio

from pokewallet import AmbiguousSetError, AsyncPokeWallet, RateLimitError, UnavailableError, ValidationError

from ..conftest import TEST_KEY, fixture, mock


def run(coro):
    return asyncio.run(coro)


def test_async_search_card_and_set_match_the_sync_results():
    async def go():
        m = mock({"body": fixture("pokemon-search")}, {"body": fixture("pokemon-card")}, {"body": fixture("pokemon-set")})
        async with m.aclient() as pw:
            page = await pw.pokemon.search("weedle", limit=3)
            card = await pw.pokemon.card(page.items[0].id)
            setp = await pw.pokemon.set("PLF", limit=3)
        return m, page, card, setp

    m, page, card, setp = run(go())
    assert page.total_pages == 22 and card.name == "Weedle" and setp.set.code == "PLF"
    assert m.calls[0]["headers"]["user-agent"].startswith("pokewallet-sdk-py/")


def test_async_iteration_and_early_validation():
    async def go():
        base = fixture("op-search")
        m = mock(*[{"body": {**base, "data": base["data"][:2], "page": p, "limit": 2, "total": 6}} for p in (1, 2, 3)])
        pw = m.aclient()
        got = [c async for c in pw.onepiece.search_all("x", limit=2)]
        try:
            await pw.pokemon.search("x", limit=0)
        except ValidationError:
            invalid = True
        await pw.aclose()
        return got, invalid, len(m.calls)

    got, invalid, calls = run(go())
    assert len(got) == 6 and invalid and calls == 3


def test_async_ambiguity_and_retry_rules():
    async def go():
        amb = mock({"body": fixture("pokemon-set-ambiguous")})
        try:
            await amb.aclient().pokemon.set("PR")
        except AmbiguousSetError as e:
            ambiguous = len(e.matches)

        limits = {"hourly": {"limit": 100, "used": 95, "remaining": 5}}
        retry = mock({"status": 429, "headers": {"retry-after": "2"}, "body": {"error": "x", "limits": limits}}, {"body": fixture("pokemon-card")})
        await retry.aclient().pokemon.card("pk_x")

        none = mock({"status": 429, "body": {"error": "x", "limits": limits}})
        try:
            await none.aclient().pokemon.card("pk_x")
        except RateLimitError:
            no_retry = len(none.calls)

        down = mock({"status": 503, "headers": {"retry-after": "5"}, "body": {"error": "busy"}})
        try:
            await down.aclient().pokemon.card("pk_x")
        except UnavailableError:
            pass
        return ambiguous, retry.sleeps, no_retry, len(down.calls), down.sleeps

    ambiguous, sleeps, no_retry, down_calls, down_sleeps = run(go())
    assert ambiguous > 1 and sleeps == [2.0] and no_retry == 1 and down_calls == 3 and down_sleeps == [5.0, 5.0]
