import { isDisambiguation, ambiguousSetError } from '../error-map.js'
import type { HttpClient } from '../http.js'
import { normalizePriceHistory } from '../normalize/pro.js'
import { normalizeCard } from '../normalize/card.js'
import type { Card, PriceHistory } from '../types.js'
import { seg } from '../validation.js'
import { CardWorld } from './card-world.js'

/** Pokémon: the shared card world plus the endpoints only Pokémon has. */
export class PokemonWorld extends CardWorld {
  constructor(http: HttpClient) {
    super(http, { prefix: '', minQuery: 1 })
  }

  /**
   * Card by id, or by plain card number together with `setCode` (`card('086/078', { setCode: 'SV8a' })`).
   * Ids from `search` and `set` are the safest input.
   */
  override async card(id: string, options: { setCode?: string } = {}): Promise<Card> {
    const body = await this.http.get(this.path(`/cards/${seg(id)}`), { set_code: options.setCode })
    if (isDisambiguation(body)) throw ambiguousSetError(200, body)
    return normalizeCard(body)
  }

  /** Price snapshots at 7/14/30/60/120 days, per finish (not a time series). Pro or trial. */
  async priceHistory(id: string): Promise<PriceHistory> {
    return normalizePriceHistory(await this.http.get(`/cards/${seg(id)}/price-history`))
  }
}
