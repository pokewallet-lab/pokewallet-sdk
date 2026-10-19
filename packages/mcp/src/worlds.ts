import { z } from 'zod'
import { GAME_CODES, type PokeWallet, type World } from '@pokewallet/sdk'

/** `pokemon` (default), `onepiece`, or one of the ten game codes. */
export const GAME_VALUES = ['pokemon', 'onepiece', ...GAME_CODES] as const
export type GameValue = (typeof GAME_VALUES)[number]

export const gameParam = z
  .enum(GAME_VALUES)
  .default('pokemon')
  .describe('Which card game: pokemon (default), onepiece, mtg, ygo, cfv, dbs, fab, dgm, swu, lor, rft or cpk.')

export function worldFor(pw: PokeWallet, game: GameValue): World {
  if (game === 'pokemon') return pw.pokemon
  if (game === 'onepiece') return pw.onepiece
  return pw.game(game)
}
