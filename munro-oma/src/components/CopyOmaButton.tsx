"use client"

import { useState, useTransition } from "react"
import { copyOmaToPeriod } from "@/app/(app)/oma/[omaId]/actions"

// Carry an OMA over to another period. Creates a new OMA there; this one is
// untouched. Only rendered for someone who can edit the OMA.
export function CopyOmaButton({
  omaId,
  periods,
}: {
  omaId: string
  periods: { id: string; label: string }[]
}) {
  const [target, setTarget] = useState(periods[0]?.id ?? "")
  const [pending, start] = useTransition()

  if (periods.length === 0) return null

  function onClick() {
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

  return (
    <div className="flex items-center gap-2">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        disabled={pending}
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
        onClick={onClick}
        disabled={pending}
        className="rounded-full border border-mfa-red px-4 py-2 font-semibold text-mfa-red disabled:opacity-60"
      >
        {pending ? "Copying…" : "Copy to period"}
      </button>
    </div>
  )
}
