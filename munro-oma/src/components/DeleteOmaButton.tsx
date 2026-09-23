"use client"

import { useTransition } from "react"
import { deleteOma } from "@/app/(app)/oma/[omaId]/actions"

export function DeleteOmaButton({
  omaId,
  sequence,
  compact = false,
}: {
  omaId: string
  sequence: number
  // The person page's OMA list is a row-sized <Link> per OMA — compact fits
  // a small delete affordance into that row without it reading as the row's
  // main action, and stops the click from also following the row's link.
  compact?: boolean
}) {
  const [pending, start] = useTransition()

  function onClick(e: React.MouseEvent) {
    if (compact) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (
      window.confirm(
        `Delete OMA ${sequence}? This removes its outcome, metric and actions.\n\nThis cannot be undone.`,
      )
    ) {
      start(() => deleteOma(omaId))
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="shrink-0 rounded-full border border-mfa-red px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mfa-red disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-full border border-mfa-red px-6 py-2 font-semibold text-mfa-red disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  )
}
