"""Typed errors. Run: python 03_errors.py"""
from pokewallet import (
    AmbiguousSetError, NotFoundError, PlanRequiredError, PokeWallet, RateLimitError, ValidationError,
)

pw = PokeWallet()

# 1. A set code that exists in several languages: pick one of the matches.
try:
    pw.pokemon.set("PR")
except AmbiguousSetError as e:
    print(f'"PR" is ambiguous ({len(e.matches)} sets), for example:')
    for m in e.matches[:3]:
        print(f"  set_id {m.set_id}: {m.name} [{m.language}]")
    page = pw.pokemon.set(e.matches[0].set_id, limit=2)
    print(f"Retried with set_id {e.matches[0].set_id}: {len(page.items)} cards")

# 2. Plan-gated data: the error carries the link to fix it.
try:
    trending = pw.pokemon.trending(limit=3)
    print("\nTrending:", ", ".join(t.set.name for t in trending))
except PlanRequiredError as e:
    print(f"\n{e}\nActivate the trial: {e.redeem_url or e.upgrade_url}")

# 3. Unknown things.
try:
    pw.pokemon.set("NOSUCHSET")
except NotFoundError as e:
    print(f"\nNot found: {e}")

# 4. Bad arguments never reach the network.
try:
    pw.pokemon.search("pikachu", limit=500)
except ValidationError as e:
    print(f"\nRejected locally: {e}")

# 5. Rate limits: handle them where you call in bulk.
try:
    pw.pokemon.sets()
except RateLimitError as e:
    print("Out of quota:", e.hourly, e.daily)
print(f"\nQuota left this hour: {pw.last_rate_limit.remaining_hour}")
