"use client"

import { useState, useTransition } from "react"
import { saveOma } from "@/app/(app)/oma/[omaId]/actions"
import type { SaveOmaInput } from "@/types"

type Oma = {
  id: string
  sequence: number
  outcome: string
  period: { label: string; startDate: string }
  metrics: { measure: string; target: string }[]
  actions: { id: string; description: string; dueDate: string | null; completed: boolean }[]
}

export function OmaEditForm({
  oma,
  canOutcomeMetric,
  canActions,
}: {
  oma: Oma
  canOutcomeMetric: boolean
  canActions: boolean
}) {
  const [outcome, setOutcome] = useState(oma.outcome)
  const [metrics, setMetrics] = useState(
    oma.metrics.length ? oma.metrics : [{ measure: "", target: "" }],
  )
  const [actions, setActions] = useState<SaveOmaInput["actions"]>(oma.actions)
  const [pending, start] = useTransition()

  function submit() {
    start(() => saveOma({ omaId: oma.id, outcome, metrics, actions }))
  }

  const cell = "w-full bg-transparent px-3 py-2 outline-none disabled:text-mfa-muted"

  return (
    <div className="rounded-2xl border-2 border-mfa-red">
      <div className="rounded-t-2xl bg-mfa-red px-5 py-3 text-white">
        <span className="font-serif text-lg">OMA {oma.sequence}</span>
        <span className="ml-6 text-sm">
          <span className="font-semibold">Period</span>{" "}
          <span className="italic">{oma.period.label}</span>
        </span>
        <span className="ml-6 text-sm">
          <span className="font-semibold">Date</span>{" "}
          <span className="italic">
            {new Date(oma.period.startDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </span>
      </div>

      <section className="border-b border-mfa-track">
        <div className="bg-mfa-panel px-5 py-2 text-sm font-semibold text-mfa-red">
          OUTCOME <span className="text-mfa-muted">— the result you&apos;re aiming for</span>
        </div>
        <textarea
          value={outcome}
          disabled={!canOutcomeMetric}
          onChange={(e) => setOutcome(e.target.value)}
          rows={2}
          className={cell}
        />
      </section>

      <section className="border-b border-mfa-track">
        <div className="bg-mfa-panel px-5 py-2 text-sm font-semibold text-mfa-red">
          METRIC / KPI <span className="text-mfa-muted">— how you&apos;ll know you&apos;re getting there</span>
        </div>
        {metrics.map((m, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_16rem] border-t border-mfa-track first:border-t-0"
          >
            <input
              value={m.measure}
              disabled={!canOutcomeMetric}
              placeholder="Metric — what you measure"
              onChange={(e) =>
                setMetrics(metrics.map((x, j) => (j === i ? { ...x, measure: e.target.value } : x)))
              }
              className={cell}
            />
            <input
              value={m.target}
              disabled={!canOutcomeMetric}
              placeholder="Target"
              onChange={(e) =>
                setMetrics(metrics.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))
              }
              className={`${cell} border-l border-mfa-track`}
            />
          </div>
        ))}
        {canOutcomeMetric && (
          <div className="flex gap-4 px-3 py-2 text-sm">
            <button
              type="button"
              onClick={() => setMetrics([...metrics, { measure: "", target: "" }])}
              className="text-mfa-red"
            >
              + Add metric
            </button>
            {metrics.length > 1 && (
              <button
                type="button"
                onClick={() => setMetrics(metrics.slice(0, -1))}
                className="text-mfa-muted"
              >
                Remove last
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="bg-mfa-panel px-5 py-2 text-sm font-semibold text-mfa-red">
          ACTIONS <span className="text-mfa-muted">— the projects and moves that drive the result</span>
        </div>
        {actions.map((a, i) => (
          <div
            key={a.id ?? `new-${i}`}
            className="grid grid-cols-[auto_1fr_10rem_auto] items-center gap-2 border-t border-mfa-track px-3 first:border-t-0"
          >
            <input
              type="checkbox"
              checked={a.completed}
              disabled={!canActions}
              onChange={(e) =>
                setActions(
                  actions.map((x, j) => (j === i ? { ...x, completed: e.target.checked } : x)),
                )
              }
              className="h-4 w-4 accent-mfa-red"
            />
            <input
              value={a.description}
              disabled={!canActions}
              placeholder="Action — what you'll do"
              onChange={(e) =>
                setActions(
                  actions.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                )
              }
              className={cell}
            />
            <input
              type="date"
              value={a.dueDate ?? ""}
              disabled={!canActions}
              onChange={(e) =>
                setActions(
                  actions.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null } : x)),
                )
              }
              className={cell}
            />
            {canActions && (
              <button
                type="button"
                onClick={() => setActions(actions.filter((_, j) => j !== i))}
                className="px-2 text-mfa-muted"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {canActions && (
          <button
            type="button"
            onClick={() =>
              setActions([...actions, { description: "", dueDate: null, completed: false }])
            }
            className="px-3 py-2 text-sm text-mfa-red"
          >
            + Add action
          </button>
        )}
      </section>

      <div className="flex justify-end p-4">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}
