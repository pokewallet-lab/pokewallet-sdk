import os

import pytest

from pokewallet import PokeWallet

HAS_KEY = bool(os.environ.get("POKEWALLET_API_KEY"))


def pytest_collection_modifyitems(config, items):
    if HAS_KEY:
        return
    skip = pytest.mark.skip(reason="POKEWALLET_API_KEY is not set")
    for item in items:
        if "contract" in str(item.fspath) and not str(item.fspath).endswith("test_public.py"):
            item.add_marker(skip)


@pytest.fixture(scope="module")
def pw():
    """The key only ever comes from the environment; without it every contract test is skipped."""
    client = PokeWallet() if HAS_KEY else None
    yield client
    if client:
        client.close()
