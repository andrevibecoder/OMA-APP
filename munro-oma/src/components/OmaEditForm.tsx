"use client"

import { useState, useTransition } from "react"
import { saveOma } from "@/app/(app)/oma/[omaId]/actions"
import { formatMetricValue } from "@/lib/progress"
import type { MetricDirection, MetricUnit, SaveOmaInput } from "@/types"

type FormMetric = {
  measure: string
  unit: MetricUnit
  direction: MetricDirection
  target: string
  current: string
}

type Oma = {
  id: string
  sequence: number
  outcome: string
  period: { label: string; startDate: string }
  metrics: {
    measure: string
    unit: MetricUnit
    direction: MetricDirection
    target: number
    current: number
  }[]
  actions: { id: string; description: string; dueDate: string | null; completed: boolean }[]
}

const EMPTY_METRIC: FormMetric = {
  measure: "",
  unit: "NUMBER",
  direction: "HIGHER_BETTER",
  target: "",
  current: "",
}

// keep digits and a single decimal point; drop everything else
function num(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "")
  const firstDot = cleaned.indexOf(".")
  return firstDot === -1
    ? cleaned
    : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "")
}

function preview(v: string, unit: MetricUnit): string {
  if (!v || v === ".") return ""
  const n = Number(v)
  return Number.isFinite(n) ? formatMetricValue(n, unit) : ""
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
  const [metrics, setMetrics] = useState<FormMetric[]>(
    (oma.metrics.length ? oma.metrics : [{ ...EMPTY_METRIC, target: 0, current: 0 }]).map((m) => ({
      measure: m.measure,
      unit: m.unit,
      direction: m.direction,
      target: m.target ? String(m.target) : "",
      current: m.current ? String(m.current) : "",
    })),
  )
  const [actions, setActions] = useState<SaveOmaInput["actions"]>(oma.actions)
  const [pending, start] = useTransition()

  function submit() {
    start(() =>
      saveOma({
        omaId: oma.id,
        outcome,
        metrics: metrics.map((m) => ({
          measure: m.measure,
          unit: m.unit,
          direction: m.direction,
          target: Number(m.target) || 0,
          current: Number(m.current) || 0,
        })),
        actions,
      }),
    )
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
          METRIC / KPI{" "}
          <span className="text-mfa-muted">— how you&apos;ll know you&apos;re getting there</span>
        </div>
        {metrics.map((m, i) => {
          const setM = (patch: Partial<FormMetric>) =>
            setMetrics(metrics.map((x, j) => (j === i ? { ...x, ...patch } : x)))
          return (
            <div
              key={i}
              className="space-y-3 border-t border-mfa-track px-5 py-4 first:border-t-0"
            >
              <input
                value={m.measure}
                disabled={!canOutcomeMetric}
                placeholder="KPI — what you measure"
                onChange={(e) => setM({ measure: e.target.value })}
                className="w-full bg-transparent font-semibold outline-none disabled:text-mfa-muted"
              />

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <select
                  value={m.unit}
                  disabled={!canOutcomeMetric}
                  onChange={(e) => setM({ unit: e.target.value as MetricUnit })}
                  className="rounded border border-mfa-track bg-white px-2 py-1 disabled:text-mfa-muted"
                >
                  <option value="NUMBER">Number</option>
                  <option value="CURRENCY">Currency (R)</option>
                  <option value="PERCENT">Percent</option>
                  <option value="DAYS">Days</option>
                </select>
                <div className="inline-flex overflow-hidden rounded border border-mfa-track">
                  {(["HIGHER_BETTER", "LOWER_BETTER"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!canOutcomeMetric}
                      onClick={() => setM({ direction: d })}
                      className={`px-3 py-1 disabled:opacity-60 ${
                        m.direction === d ? "bg-mfa-red text-white" : "text-mfa-muted"
                      }`}
                    >
                      {d === "HIGHER_BETTER" ? "Higher is better" : "Lower is better"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid max-w-md grid-cols-2 gap-4 text-sm">
                <label className="block">
                  <span className="text-mfa-muted">Target</span>
                  <input
                    value={m.target}
                    disabled={!canOutcomeMetric}
                    inputMode="decimal"
                    placeholder="0"
                    onChange={(e) => setM({ target: num(e.target.value) })}
                    className="mt-1 w-full rounded border border-mfa-track px-2 py-1 disabled:text-mfa-muted"
                  />
                  <span className="mt-1 block h-4 text-xs text-mfa-muted">
                    {preview(m.target, m.unit)}
                  </span>
                </label>
                <label className="block">
                  <span className="text-mfa-muted">Current</span>
                  <input
                    value={m.current}
                    disabled={!canOutcomeMetric}
                    inputMode="decimal"
                    placeholder="0"
                    onChange={(e) => setM({ current: num(e.target.value) })}
                    className="mt-1 w-full rounded border border-mfa-track px-2 py-1 disabled:text-mfa-muted"
                  />
                  <span className="mt-1 block h-4 text-xs text-mfa-muted">
                    {preview(m.current, m.unit)}
                  </span>
                </label>
              </div>
            </div>
          )
        })}
        {canOutcomeMetric && (
          <div className="flex gap-4 px-5 py-2 text-sm">
            <button
              type="button"
              onClick={() => setMetrics([...metrics, { ...EMPTY_METRIC }])}
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
          ACTIONS{" "}
          <span className="text-mfa-muted">— the projects and moves that drive the result</span>
        </div>
        {actions.map((a, i) => (
          <div
            key={a.id ?? `new-${i}`}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border-t border-mfa-track px-3 first:border-t-0"
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
            <div className="flex items-center gap-1 px-3 text-sm text-mfa-muted">
              <span>Due</span>
              <input
                type="date"
                value={a.dueDate ?? ""}
                disabled={!canActions}
                onChange={(e) =>
                  setActions(
                    actions.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null } : x)),
                  )
                }
                className="bg-transparent py-2 text-mfa-ink outline-none disabled:text-mfa-muted"
              />
            </div>
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
