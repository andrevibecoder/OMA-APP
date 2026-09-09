"use client"

import { useTransition } from "react"
import type { OmaRating } from "@prisma/client"
import { setItemRating } from "@/modules/review/actions/score"

const OPTIONS: { value: OmaRating; label: string }[] = [
  { value: "BELOW", label: "1 · Below" },
  { value: "MEETS", label: "2 · Meets" },
  { value: "EXCEEDS", label: "3 · Exceeds" },
]

export function RatingControl({
  reviewId,
  itemId,
  value,
}: {
  reviewId: string
  itemId: string
  value: OmaRating | null
}) {
  const [pending, start] = useTransition()
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-mfa-track">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={pending}
          onClick={() => start(() => setItemRating(reviewId, itemId, o.value))}
          className={`px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${
            value === o.value ? "bg-mfa-red text-white" : "text-mfa-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
