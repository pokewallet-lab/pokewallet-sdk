// The few Workers runtime types this entry point needs, so the package does not pull in a
// second set of global types next to the DOM ones.
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

interface ExportedHandler<Env = unknown> {
  fetch?(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>
}
