"use client"

import { useTransition } from "react"
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
  const [pending, start] = useTransition()
  return (
    <input
      type="checkbox"
      defaultChecked={completed}
      disabled={disabled || pending}
      onChange={(e) => start(() => tickAction(actionId, e.target.checked))}
      className="h-4 w-4 accent-mfa-red"
    />
  )
}
