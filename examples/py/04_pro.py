"""Pro endpoints (Pro plan or the 7-day trial; Ultra for the ten games). Run: python 04_pro.py"""
from pokewallet import PlanRequiredError, PokeWallet

pw = PokeWallet()

try:
    stats = pw.pokemon.statistics("PLF")
    top_card = stats.tcgplayer.most_expensive
    print(f"{stats.set.name}: average ${stats.tcgplayer.avg}, most expensive {top_card.name} (${top_card.price})")

    cost = pw.pokemon.completion_value("PLF")
    print(f"Completing the set costs about ${cost.tcgplayer.market} (TCGPlayer market)")

    top = pw.pokemon.top_cards(limit=3)
    print("Most expensive:", " | ".join(f"{t.name} ${t.price}" for t in top))

    growth = pw.pokemon.top_cards(metric="growth", source="cm", limit=3)
    print("Fastest growing:", " | ".join(f"{t.name} {t.change_7d}" for t in growth))

    hot = pw.pokemon.trending(limit=1)[0]
    print(f"Trending set: {hot.set.name} {hot.change}")

    first = pw.pokemon.search("charizard", limit=1).items[0]
    history = pw.pokemon.price_history(first.id)
    finish, point = next(iter((history.tcgplayer or history.cardmarket or {}).items()))
    print(f"{history.name} ({finish}): now {point.current}, 30 days ago {point.price[30]}")
except PlanRequiredError as e:
    print(f"{e}\nGet access: {e.redeem_url or e.upgrade_url}")
