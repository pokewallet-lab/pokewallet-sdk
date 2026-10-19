import { HttpClient, type ClientOptions, type RateLimitInfo } from './http.js'
import { imageUrl, type ImageUrlOptions } from './images.js'
import { normalizeGames, normalizeHealth, isHealthReport } from './normalize/misc.js'
import { GAME_CODES, type Game, type GameCode, type Health } from './types.js'
import { CardWorld } from './worlds/card-world.js'
import { OnePieceWorld } from './worlds/onepiece-world.js'
import { PokemonWorld } from './worlds/pokemon-world.js'
import type { World } from './worlds/world.js'

/**
 * Entry point. One interface for every world:
 *
 * ```ts
 * const pw = new PokeWallet({ apiKey: process.env.POKEWALLET_API_KEY })
 * await pw.pokemon.search('charizard')
 * await pw.onepiece.set('OP01')
 * await pw.games.mtg.search('black lotus')
 * ```
 */
export class PokeWallet {
  readonly pokemon: PokemonWorld
  readonly onepiece: World
  readonly games: Readonly<Record<GameCode, World>>

  readonly #http: HttpClient
  readonly #baseUrl: string | undefined

  constructor(options: ClientOptions = {}) {
    this.#http = new HttpClient(options)
    this.#baseUrl = options.baseUrl
    this.pokemon = new PokemonWorld(this.#http)
    this.onepiece = new OnePieceWorld(this.#http)
    const games = {} as Record<GameCode, World>
    for (const code of GAME_CODES) {
      games[code] = new CardWorld(this.#http, { prefix: `/${code}`, periods: ['7d'], minQuery: 2 })
    }
    this.games = games
  }

  /** Quota counters from the most recent answer, or null before the first call. */
  get lastRateLimit(): RateLimitInfo | null {
    return this.#http.lastRateLimit
  }

  /** The world for a game code known only at runtime. */
  game(code: GameCode): World {
    return this.games[code]
  }

  /**
   * Service status. Works without a key; the header is sent only when a key is set.
   *
   * The API answers 503 with a full report when a critical service is down. That report is
   * information, not a failure: it is returned like a 200, with `status: 'unhealthy'` and the
   * failing `checks`, and is never retried. A 503 without a report (for example an error page
   * from the edge) still throws `UnavailableError`.
   */
  async health(): Promise<Health> {
    return normalizeHealth(await this.#http.get('/health', undefined, { isPublic: true, accept: isHealthReport }))
  }

  /** The ten games with their route maps. Works without a key. */
  async listGames(): Promise<Game[]> {
    return normalizeGames(await this.#http.get('/games', undefined, { isPublic: true }))
  }

  toJSON(): { client: unknown } {
    return { client: this.#http.toJSON() }
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `PokeWallet ${JSON.stringify(this.toJSON())}`
  }

  /** See {@link imageUrl}: the URL still needs the API key header. */
  imageUrl(id: string, options: Omit<ImageUrlOptions, 'baseUrl'> = {}): string {
    return imageUrl(id, { ...options, baseUrl: this.#baseUrl })
  }
}
