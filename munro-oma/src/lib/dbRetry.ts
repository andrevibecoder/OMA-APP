// Retry a database operation that failed *before it ran* — the connection pool
// was exhausted under concurrent load (Prisma P2024) or the database was briefly
// unreachable (P1001). These never touched the database, so retrying is safe.
// Any other error (validation, unique clash, "not allowed", a real query error)
// rethrows immediately — we must not replay a write that may have partly applied.

const RETRIABLE = new Set(["P2024", "P1001"])

function errorCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e
    ? (e as { code?: unknown }).code as string | undefined
    : undefined
}

export async function withDbRetry<T>(
  op: () => Promise<T>,
  { tries = 3, delayMs = 150 }: { tries?: number; delayMs?: number } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await op()
    } catch (e) {
      const code = errorCode(e)
      if (!code || !RETRIABLE.has(code) || attempt >= tries) throw e
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs * attempt))
    }
  }
}
