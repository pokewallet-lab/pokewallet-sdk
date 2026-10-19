"""Walk every page without handling page numbers. Run: python 02_pagination.py"""
from pokewallet import PokeWallet

pw = PokeWallet()

# One Piece and the ten games paginate differently on the wire; here they look the same.
n = 0
for card in pw.pokemon.set_cards("PLF", limit=50, max_items=120):
    n += 1
    if n % 40 == 0:
        print(f"  ...{n} cards, latest: {card.name}")
print(f"Walked {n} cards of Plasma Freeze")

hits = sum(1 for _ in pw.onepiece.search_all("luffy", limit=20, max_items=45))
print(f"Walked {hits} One Piece search results")

# Manual paging works too.
page2 = pw.pokemon.search("pikachu", page=2, limit=10)
print(f"Page {page2.page}/{page2.total_pages}: {', '.join(c.name for c in page2.items[:3])}…")
