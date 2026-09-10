"use client"

import { useState, useTransition } from "react"
import { copyOmaToPeriod } from "@/app/(app)/oma/[omaId]/actions"

// Carry an OMA over to another period. Creates a new OMA there; this one is
// untouched. Collapsed to a single button until clicked, so the action bar
// doesn't stay crowded.
export function CopyOmaButton({
  omaId,
  periods,
}: {
  omaId: string
  periods: { id: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState(periods[0]?.id ?? "")
  const [pending, start] = useTransition()

  if (periods.length === 0) return null

  function copy() {
    if (!target) return
    const label = periods.find((p) => p.id === target)?.label ?? "that period"
    if (
      window.confirm(
        `Copy this OMA into ${label}?\n\nA new OMA is created there with the same outcome, KPIs and actions. This one stays as it is.`,
      )
    ) {
      start(() => copyOmaToPeriod(omaId, target))
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-mfa-red px-4 py-2 font-semibold text-mfa-red"
      >
        Copy to period
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        disabled={pending}
        autoFocus
        className="rounded-full border border-mfa-red bg-white px-3 py-2 text-sm text-mfa-red outline-none disabled:opacity-60"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={copy}
        disabled={pending}
        className="rounded-full bg-mfa-red px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Copying…" : "Copy"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        className="px-2 text-sm text-mfa-muted"
      >
        Cancel
      </button>
    </div>
  )
}
