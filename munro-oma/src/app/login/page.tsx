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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-8">
      <h1 className="font-serif text-3xl font-light">Munro FA</h1>
      <p className="mt-1 text-mfa-muted">OMA performance</p>
      <form action={action} className="mt-8 space-y-4">
        <input name="email" type="email" required placeholder="Email"
          className="w-full rounded-lg border border-mfa-track px-4 py-2" />
        <input name="password" type="password" required placeholder="Password"
          className="w-full rounded-lg border border-mfa-track px-4 py-2" />
        {state.error && <p className="text-sm text-mfa-red">{state.error}</p>}
        <SubmitButton />
      </form>
    </main>
  )
}
