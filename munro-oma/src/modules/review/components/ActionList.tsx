"use client"

import { useState } from "react"
import type { SnapshotAction } from "@/modules/review/snapshot"

// A review can carry many actions, most needing no comment at review. Show the
// first few per group; the rest fold behind "Show more".
const CAP = 3

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function Group({
  title,
  actions,
  done = false,
}: {
  title: string
  actions: SnapshotAction[]
  done?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  if (actions.length === 0) return null

  const visible = expanded ? actions : actions.slice(0, CAP)
  const hidden = actions.length - visible.length

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-mfa-muted">{title}</h3>
      <ul className="space-y-2">
        {visible.map((a) => (
          <li
            key={a.ref}
            className="flex items-center gap-4 rounded-xl bg-mfa-panel px-5 py-3"
          >
            <span className={done ? "flex-1 text-mfa-muted line-through" : "flex-1"}>
              {a.description}
            </span>
            <span className="shrink-0 text-sm text-mfa-muted">
              {done ? "Completed" : a.dueDate ? `Due ${fmtDate(a.dueDate)}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-sm font-semibold text-mfa-red hover:underline"
        >
          Show {hidden} more
        </button>
      )}
      {expanded && actions.length > CAP && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 ml-4 text-sm text-mfa-muted hover:underline"
        >
          Show less
        </button>
      )}
    </div>
  )
}

export function ActionList({ actions }: { actions: SnapshotAction[] }) {
  if (actions.length === 0) return <p className="text-sm text-mfa-muted">No actions.</p>
  const todo = actions.filter((a) => !a.completed)
  const done = actions.filter((a) => a.completed)
  return (
    <div className="space-y-4">
      <Group title="To do" actions={todo} />
      <Group title={`Done (${done.length})`} actions={done} done />
    </div>
  )
}
