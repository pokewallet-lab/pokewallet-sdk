import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import pytest

from pokewallet import AsyncPokeWallet, PokeWallet

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures"
# Distinctive on purpose, so a leak cannot hide behind a common substring.
SECRET = "pk_example_FAKEKEY0123456789abcdef"
TEST_KEY = "pk_test_not_a_real_key"


def fixture(name: str) -> Any:
    """Recorded answers (trimmed lists, no credentials) from the shared ``tests/fixtures``."""
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf8"))


class Mock:
    """Answers from a queue and records what it was asked. The last reply repeats."""

    def __init__(self, replies: List[Dict[str, Any]]) -> None:
        self.replies = replies
        self.calls: List[Dict[str, Any]] = []
        self.sleeps: List[float] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append({"url": str(request.url), "headers": dict(request.headers)})
        r = self.replies[min(len(self.calls) - 1, len(self.replies) - 1)]
        kwargs: Dict[str, Any] = {"headers": r.get("headers", {})}
        if "body" in r:
            kwargs["json"] = r["body"]
        return httpx.Response(r.get("status", 200), **kwargs)

    def sync_sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)

    async def async_sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)

    def client(self, key: str = TEST_KEY, **kw: Any) -> PokeWallet:
        return PokeWallet(key, transport=httpx.MockTransport(self.handler), sleep=self.sync_sleep, **kw)

    def aclient(self, key: str = TEST_KEY, **kw: Any) -> AsyncPokeWallet:
        return AsyncPokeWallet(key, transport=httpx.MockTransport(self.handler), sleep=self.async_sleep, **kw)


def mock(*replies: Dict[str, Any]) -> Mock:
    return Mock(list(replies))


def failure(fn: Any, *args: Any, **kwargs: Any) -> BaseException:
    """Runs ``fn`` and returns the exception it raised; fails the test if it did not raise."""
    try:
        fn(*args, **kwargs)
    except BaseException as exc:  # noqa: BLE001
        return exc
    pytest.fail("expected an exception")


INTERNAL_FIELDS = ("product_id", "encrypted_id", "public_url", "cardmarket_product_id")


def internal_fields(value: Any) -> list:
    """Keys that must never appear in an answer, at any depth."""
    import json

    text = json.dumps(value, default=str)
    return [k for k in INTERNAL_FIELDS if f'"{k}"' in text]
