"use client"

import { useState, useTransition } from "react"

// A server action that calls redirect() / notFound() rejects the client promise
// with a framework "error" carrying this digest. It's control flow, not a failure.
// (Copied from OmaEditForm — the review module may not import @/components/**.)
function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    ((e as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (e as { digest: string }).digest === "NEXT_NOT_FOUND")
  )
}

// Shared client helper: run a server action inside a transition and, if it
// rejects (someone else completed the review, access revoked, network error),
// surface `error.message` as an inline role="alert" in the app's style. The
// error clears on the next attempt. Keeps the review module's client controls
// consistent with OmaEditForm's setError + role="alert".
export function useActionError() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<void>): void {
    setError(null)
    // Return the promise chain to the transition (no braces) so `pending` stays
    // true until the server action settles — matches OmaEditForm's start(() => …)
    // pattern and prevents a double-submit while the action is in flight.
    startTransition(() =>
      action().catch((e: unknown) => {
        if (isRedirectError(e)) return
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Something went wrong. Please try again.",
        )
      }),
    )
  }

  const errorNode = error ? (
    <p role="alert" className="mt-1 text-sm font-semibold text-mfa-red">
      {error}
    </p>
  ) : null

  return { pending, run, errorNode }
}
