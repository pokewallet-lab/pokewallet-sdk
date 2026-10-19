import type { Page } from './types.js'

/** Builds a Page, computing `totalPages` here so it is always a finite number. */
export function makePage<T>(items: T[], meta: { page: number; limit: number; total: number }): Page<T> {
  const totalPages = meta.limit > 0 ? Math.ceil(meta.total / meta.limit) : 0
  return { items, page: meta.page, limit: meta.limit, total: meta.total, totalPages }
}

/**
 * Walks every page of any list endpoint as one async sequence. The two pagination
 * shapes of the API are already hidden behind `fetchPage`.
 */
export async function* paginate<T>(
  fetchPage: (page: number) => Promise<Page<T>>,
  options: { startPage?: number; maxItems?: number } = {},
): AsyncGenerator<T, void, undefined> {
  let page = options.startPage ?? 1
  let yielded = 0
  for (;;) {
    const res = await fetchPage(page)
    for (const item of res.items) {
      if (options.maxItems !== undefined && yielded >= options.maxItems) return
      yield item
      yielded++
    }
    if (res.items.length === 0 || page >= res.totalPages) return
    page++
  }
}
