"use client"

import { useState } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { login } from "./actions"

function PasswordField() {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        name="password"
        type={visible ? "text" : "password"}
        required
        placeholder="Password"
        className="w-full rounded-lg border border-mfa-track px-4 py-2 pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-mfa-muted hover:text-mfa-ink"
      >
        {visible ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
            <line x1="3" y1="21" x2="21" y2="3" />
          </svg>
        )}
      </button>
    </div>
  )
}

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
        <div className="text-center">
          <h1 className="text-4xl font-bold text-mfa-ink">OMA</h1>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-mfa-muted">
            Define it.
            <br />
            Track it.
            <br />
            Do it.
          </p>
        </div>
        <form action={action} className="mt-8 space-y-4">
          <input name="email" type="email" required placeholder="Email"
            className="w-full rounded-lg border border-mfa-track px-4 py-2" />
          <PasswordField />
          {state.error && <p className="text-sm text-mfa-red">{state.error}</p>}
          <SubmitButton />
        </form>
      </div>
    </main>
  )
}
