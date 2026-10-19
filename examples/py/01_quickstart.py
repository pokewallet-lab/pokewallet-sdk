"""First search, one card with prices, one set. Run: python 01_quickstart.py"""
from pokewallet import PokeWallet

pw = PokeWallet()  # reads POKEWALLET_API_KEY

results = pw.pokemon.search("charizard", limit=3)
print(f"{results.total} cards match, showing {len(results.items)}")
for card in results.items:
    usd = card.tcgplayer.prices[0].market if card.tcgplayer and card.tcgplayer.prices else None  # TCGPlayer USD
    eur = card.cardmarket.prices[0].trend if card.cardmarket and card.cardmarket.prices else None  # CardMarket EUR
    print(f"- {card.name} | {card.set_name} #{card.number} | ${usd} / €{eur} | {card.id[:12]}…")

# Details of one card, by the id a search returned.
card = pw.pokemon.card(results.items[0].id)
print(f"\n{card.name}: rarity {card.rarity}")
for p in card.tcgplayer.prices if card.tcgplayer else []:
    print(f"  {p.variant}: market ${p.market}, low ${p.low}, high ${p.high}")

# A set, by code.
page = pw.pokemon.set("PLF", limit=5)
print(f"\n{page.set.name} ({page.set.code}): {page.total} cards, page {page.page} of {page.total_pages}")
for c in page.items:
    print(f"  {c.number} {c.name}")

print(f"\nRequests left this hour: {pw.last_rate_limit.remaining_hour} of {pw.last_rate_limit.limit_hour}")
