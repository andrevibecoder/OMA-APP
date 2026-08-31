"use client"

import { useTransition } from "react"
import { deleteOma } from "@/app/(app)/oma/[omaId]/actions"

export function DeleteOmaButton({ omaId, sequence }: { omaId: string; sequence: number }) {
  const [pending, start] = useTransition()

  function onClick() {
    if (
      window.confirm(
        `Delete OMA ${sequence}? This removes its outcome, metric and actions.\n\nThis cannot be undone.`,
      )
    ) {
      start(() => deleteOma(omaId))
    }
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
