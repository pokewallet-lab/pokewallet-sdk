import type { FetchLike } from '../../src/http.js'

export interface Reply {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

export interface Recorded {
  url: string
  headers: Record<string, string>
}

/** A fetch that answers from a queue and records what it was asked. The last reply repeats. */
export function mockFetch(replies: Reply[]): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = []
  const fetch: FetchLike = async (input, init) => {
    calls.push({ url: input, headers: { ...((init?.headers as Record<string, string>) ?? {}) } })
    const r = replies[Math.min(calls.length - 1, replies.length - 1)]!
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    })
  }
  return { fetch, calls }
}

export const noSleep = async (): Promise<void> => {}

export const TEST_KEY = 'pk_test_not_a_real_key'

/** Returns the rejection reason; fails the test if the promise does not reject. */
export const fail = (p: Promise<unknown>): Promise<any> =>
  p.then(
    () => {
      throw new Error('expected the promise to reject')
    },
    (e: unknown) => e,
  )
