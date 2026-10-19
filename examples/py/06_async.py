"""Async client, concurrent calls and async iteration. Run: python 06_async.py"""
import asyncio

from pokewallet import AsyncPokeWallet


async def main() -> None:
    async with AsyncPokeWallet() as pw:
        pikachu, op, lotus = await asyncio.gather(
            pw.pokemon.search("pikachu", limit=2),
            pw.onepiece.search("luffy", limit=2),
            pw.games.mtg.search("black lotus", limit=2),
        )
        print("pokemon:", ", ".join(c.name for c in pikachu.items))
        print("onepiece:", ", ".join(c.name for c in op.items))
        print("mtg:", ", ".join(c.name for c in lotus.items))

        count = 0
        async for _ in pw.pokemon.set_cards("PLF", limit=50, max_items=60):
            count += 1
        print(f"async walked {count} cards")


asyncio.run(main())
