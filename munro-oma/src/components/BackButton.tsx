"use client"

import { useRouter } from "next/navigation"

export function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-mfa-muted hover:text-mfa-ink"
    >
      <span aria-hidden>←</span> Back
    </button>
  )
}
