"use client"

import { useEffect, useState, useTransition } from "react"
import { tickAction } from "@/app/(app)/oma/[omaId]/actions"

export function ActionCheckbox({
  actionId,
  completed,
  disabled,
}: {
  actionId: string
  completed: boolean
  disabled: boolean
}) {
  const [checked, setChecked] = useState(completed)
  const [error, setError] = useState(false)
  const [pending, start] = useTransition()

  useEffect(() => setChecked(completed), [completed])

  return (
    <span className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.checked
          setChecked(next)
          setError(false)
          start(async () => {
            try {
              await tickAction(actionId, next)
            } catch {
              setChecked(!next)
              setError(true)
            }
          })
        }}
        className="h-4 w-4 accent-mfa-red"
      />
      {error && <span className="text-xs text-mfa-red">Couldn&apos;t save — try again</span>}
    </span>
  )
}
