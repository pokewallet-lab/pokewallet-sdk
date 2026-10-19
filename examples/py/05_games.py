"""The other games use the same interface. Run: python 05_games.py"""
from pokewallet import PokeWallet

pw = PokeWallet()

lotus = pw.games.mtg.search("black lotus", limit=2)
for c in lotus.items:
    price = c.tcgplayer.prices[0].market if c.tcgplayer and c.tcgplayer.prices else "?"
    print(f"mtg: {c.name} | {c.set_name} | ${price if price is not None else '?'}")

# Game-specific fields (here Magic's power, toughness and type line) live in card.info.
emrakul = pw.games.mtg.search("emrakul the exigent", limit=1).items[0]
card = pw.games.mtg.card(emrakul.id)
print(f"{card.name}: {card.info['sub_type']}, {card.info['p']}/{card.info['t']}")

print("ygo:", " | ".join(c.name for c in pw.games.ygo.search("blue-eyes", limit=2).items))
print("onepiece:", " | ".join(f"{c.name} ({c.rarity})" for c in pw.onepiece.search("luffy", limit=2).items))

# Pick a game at runtime. Codes: mtg ygo cfv dbs fab dgm swu lor rft cpk
code = "lor"
hits = pw.game(code).search("elsa", limit=1).items
print(f"{code}:", hits[0].name if hits else None)

# Public, no key needed: the list of games and the service status.
games = pw.list_games()
print(f"{len(games)} games:", ", ".join(f"{g.code} ({g.name})" for g in games))
print("API status:", pw.health().status)
