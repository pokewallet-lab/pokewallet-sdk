import os

import pytest

from pokewallet import PokeWallet

HAS_KEY = bool(os.environ.get("POKEWALLET_API_KEY"))
# Point the suites at another deployment (for example a local instance) instead of production.
BASE_URL = os.environ.get("POKEWALLET_BASE_URL") or None
# Card languages (``lang``) are checked only when this is set: the suites run against production by
# default, and the feature is not there until the API that serves it is deployed.
HAS_LANG = bool(os.environ.get("POKEWALLET_LANG_LIVE"))


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
    client = PokeWallet(base_url=BASE_URL) if HAS_KEY else None
    yield client
    if client:
        client.close()
