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
  periodId: string
  date: string // yyyy-mm-dd
  outcome: string
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

// Formatted-value hint shown under a number input — only when the formatting
// actually differs from what the user typed (e.g. "3000" -> "3 000", "8" -> "R8").
function hint(v: string, unit: MetricUnit): string {
  if (!v || v === ".") return ""
  const n = Number(v)
  if (!Number.isFinite(n)) return ""
  const formatted = formatMetricValue(n, unit)
  return formatted === v ? "" : formatted
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function OmaEditForm({
  oma,
  periods,
  canOutcomeMetric,
  canActions,
}: {
  oma: Oma
  periods: { id: string; label: string }[]
  canOutcomeMetric: boolean
  canActions: boolean
}) {
  const [sequence, setSequence] = useState(oma.sequence)
  const [periodId, setPeriodId] = useState(oma.periodId)
  const [date, setDate] = useState(oma.date)
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
        periodId,
        sequence,
        date,
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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-t-2xl bg-mfa-red px-5 py-3 text-white">
        <span className="font-serif text-lg">
          OMA{" "}
          {canOutcomeMetric ? (
            <select
              value={sequence}
              onChange={(e) => setSequence(Number(e.target.value))}
              className="rounded bg-white/15 px-1 font-serif text-white ring-1 ring-white/40 outline-none"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n} className="text-mfa-ink">
                  {n}
                </option>
              ))}
            </select>
          ) : (
            sequence
          )}
        </span>
        <span className="text-sm">
          <span className="font-semibold">Period</span>{" "}
          {canOutcomeMetric ? (
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="rounded bg-white/15 px-1 text-white ring-1 ring-white/40 outline-none"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id} className="text-mfa-ink">
                  {p.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="italic">{periods.find((p) => p.id === periodId)?.label}</span>
          )}
        </span>
        <span className="text-sm">
          <span className="font-semibold">Date</span>{" "}
          {canOutcomeMetric ? (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded bg-white/15 px-1 text-white ring-1 ring-white/40 outline-none [color-scheme:dark]"
            />
          ) : (
            <span className="italic">{fmtDate(date)}</span>
          )}
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
              className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-mfa-track px-5 py-4 text-sm first:border-t-0"
            >
              <label className="flex min-w-[12rem] flex-1 flex-col">
                <span className="text-xs text-mfa-muted">KPI</span>
                <input
                  value={m.measure}
                  disabled={!canOutcomeMetric}
                  placeholder="what you measure"
                  onChange={(e) => setM({ measure: e.target.value })}
                  className="border-b border-mfa-track bg-transparent py-1 font-semibold outline-none focus:border-mfa-red disabled:text-mfa-muted"
                />
              </label>

              <label className="flex flex-col">
                <span className="text-xs text-mfa-muted">Unit</span>
                <select
                  value={m.unit}
                  disabled={!canOutcomeMetric}
                  onChange={(e) => setM({ unit: e.target.value as MetricUnit })}
                  className="rounded border border-mfa-track bg-white px-2 py-1.5 disabled:text-mfa-muted"
                >
                  <option value="NUMBER">Number</option>
                  <option value="CURRENCY">Currency (R)</option>
                  <option value="PERCENT">Percent</option>
                  <option value="DAYS">Days</option>
                </select>
              </label>

              <div className="flex flex-col">
                <span className="text-xs text-mfa-muted">Direction</span>
                <div className="inline-flex overflow-hidden rounded border border-mfa-track">
                  {(["HIGHER_BETTER", "LOWER_BETTER"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!canOutcomeMetric}
                      onClick={() => setM({ direction: d })}
                      title={d === "HIGHER_BETTER" ? "Higher is better" : "Lower is better"}
                      className={`px-2.5 py-1.5 disabled:opacity-60 ${
                        m.direction === d ? "bg-mfa-red text-white" : "text-mfa-muted"
                      }`}
                    >
                      {d === "HIGHER_BETTER" ? "↑ Higher" : "↓ Lower"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex w-24 flex-col">
                <span className="text-xs text-mfa-muted">Target</span>
                <input
                  value={m.target}
                  disabled={!canOutcomeMetric}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => setM({ target: num(e.target.value) })}
                  className="rounded border border-mfa-track px-2 py-1.5 disabled:text-mfa-muted"
                />
              </label>

              <label className="flex w-24 flex-col">
                <span className="text-xs text-mfa-muted">Current</span>
                <input
                  value={m.current}
                  disabled={!canOutcomeMetric}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => setM({ current: num(e.target.value) })}
                  className="rounded border border-mfa-track px-2 py-1.5 disabled:text-mfa-muted"
                />
              </label>

              {(hint(m.target, m.unit) || hint(m.current, m.unit)) && (
                <div className="w-full text-xs text-mfa-muted">
                  {hint(m.target, m.unit) && <span>Target: {hint(m.target, m.unit)}</span>}
                  {hint(m.current, m.unit) && (
                    <span className="ml-4">Current: {hint(m.current, m.unit)}</span>
                  )}
                </div>
              )}
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
