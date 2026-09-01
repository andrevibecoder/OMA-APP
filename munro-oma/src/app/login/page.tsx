"use client"

import { useFormState, useFormStatus } from "react-dom"
import { login } from "./actions"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="w-full rounded-full bg-mfa-red px-4 py-2 font-semibold text-white disabled:opacity-60">
      {pending ? "Signing in…" : "Sign in"}
    </button>
  )
}

export default function LoginPage() {
  const [state, action] = useFormState(login, {})
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-mfa-black px-6">
      <div className="w-full max-w-sm rounded-2xl bg-mfa-white px-8 py-10">
        <h1 className="text-center text-3xl font-bold text-mfa-ink">
          OMA —
          <br />
          Define it. Track it. Do it.
        </h1>
        <form action={action} className="mt-8 space-y-4">
          <input name="email" type="email" required placeholder="Email"
            className="w-full rounded-lg border border-mfa-track px-4 py-2" />
          <input name="password" type="password" required placeholder="Password"
            className="w-full rounded-lg border border-mfa-track px-4 py-2" />
          {state.error && <p className="text-sm text-mfa-red">{state.error}</p>}
          <SubmitButton />
        </form>
      </div>
    </main>
  )
}
