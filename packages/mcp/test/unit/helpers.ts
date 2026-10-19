import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Recorded answers shared with the SDK tests (repo-level tests/fixtures). */
export function fixture(name: string): any {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/${name}.json`, import.meta.url)), 'utf8'))
}

export interface Reply {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

export const calls: Array<{ url: string; headers: Record<string, string> }> = []

/** A fetch that answers from a queue (the last reply repeats) and records the calls. */
export function stubFetch(replies: Reply[]): typeof fetch {
  let i = 0
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: { ...((init?.headers as Record<string, string>) ?? {}) } })
    const r = replies[Math.min(i++, replies.length - 1)]!
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    })
  }) as typeof fetch
}
