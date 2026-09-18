"use client"

import { useRef, useState, useTransition } from "react"
import { parsePdf, createImportedOmas } from "@/app/(app)/import/actions"
import { draftOmaBlockers } from "@/lib/omaImport/createFromDraft"
import { formatMetricValue, parseAmount } from "@/lib/progress"
import type { ImportDraft } from "@/lib/omaImport/toDraft"
import type { MetricDirection, MetricUnit } from "@/types"

type ReviewMetric = {
  measure: string
  unit: MetricUnit
  direction: MetricDirection
  target: string // shorthand-friendly text ("3 mill"), like OmaEditForm's FormMetric.target
  targetText: string
}

type ReviewAction = {
  description: string
  dueDate: string | null
  completed: boolean
  statusText: string
}

type ReviewOma = {
  title: string
  outcome: string
  metrics: ReviewMetric[]
  actions: ReviewAction[]
}

type Phase =
  | { kind: "upload" }
  | { kind: "review"; draft: ImportDraft; omas: ReviewOma[]; subjectId: string; periodId: string }

function toReviewOma(o: ImportDraft["omas"][number]): ReviewOma {
  return {
    title: o.title,
    outcome: o.outcome,
    metrics: o.metrics.map((m) => ({
      measure: m.measure,
      unit: m.unit,
      direction: m.direction,
      target: String(m.target),
      targetText: m.targetText,
    })),
    actions: o.actions.map((a) => ({ ...a })),
  }
}

// A server action that calls redirect() rejects the client promise with a
// framework "error" carrying this digest — control flow, not a failure.
// (Same helper as OmaEditForm.tsx uses for saveOma.)
function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

function num(v: string): string {
  return v.replace(/[^0-9.,\s a-zA-Z$]/g, "")
}

function hint(v: string, unit: MetricUnit): string {
  const n = parseAmount(v)
  if (n === null) return ""
  const formatted = formatMetricValue(n, unit)
  return formatted === v.trim() ? "" : formatted
}

export function ImportReview({
  subjects,
  periods,
  defaultSubjectId,
  defaultPeriodId,
  hasApiKey,
}: {
  subjects: { id: string; name: string }[]
  periods: { id: string; label: string }[]
  defaultSubjectId: string
  defaultPeriodId: string | null
  hasApiKey: boolean
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "upload" })
  const [uploadSubjectId, setUploadSubjectId] = useState(defaultSubjectId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!hasApiKey) {
    return <p className="mt-6 text-mfa-muted">AI import isn&apos;t configured on this environment.</p>
  }

  // Read the file via a ref and build FormData manually, then submit through
  // useTransition — the same onClick-driven pattern OmaEditForm.tsx uses for
  // saveOma, rather than <form action={fn}> (unverified for a plain client
  // function, as opposed to a "use server" action, on React 18.3 / Next 14.2).
  function handleUpload() {
    setError(null)
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError("Choose a PDF to import.")
      return
    }
    const formData = new FormData()
    formData.set("file", file)
    start(async () => {
      const result = await parsePdf(formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setPhase({
        kind: "review",
        draft: result,
        omas: result.omas.map(toReviewOma),
        subjectId: uploadSubjectId,
        periodId: result.periodId ?? defaultPeriodId ?? periods[0]?.id ?? "",
      })
    })
  }

  function handleCreate() {
    if (phase.kind !== "review") return
    setError(null)
    const payload = phase.omas.map((o) => ({
      title: o.title,
      outcome: o.outcome,
      metrics: o.metrics.map((m) => ({
        measure: m.measure,
        unit: m.unit,
        direction: m.direction,
        target: parseAmount(m.target) ?? 0,
        targetText: m.targetText,
      })),
      actions: o.actions.map((a) => ({
        description: a.description,
        dueDate: a.dueDate,
        completed: a.completed,
        statusText: a.statusText,
      })),
    }))
    start(() =>
      createImportedOmas(phase.subjectId, phase.periodId, payload)
        .then((result) => {
          if (result && "error" in result) setError(result.error)
        })
        .catch((e: unknown) => {
          if (isRedirectError(e)) return
          setError(e instanceof Error && e.message ? e.message : "Something went wrong while creating. Please try again.")
        }),
    )
  }

  if (phase.kind === "upload") {
    return (
      <div className="max-w-lg space-y-4 rounded-2xl border-2 border-mfa-red p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Import for</span>
          <select
            value={uploadSubjectId}
            onChange={(e) => setUploadSubjectId(e.target.value)}
            className="rounded border border-mfa-track px-2 py-1.5"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">PDF file</span>
          <input ref={fileInputRef} type="file" accept="application/pdf" className="text-sm" />
        </label>
        {error && (
          <p role="alert" className="text-sm font-semibold text-mfa-red">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleUpload}
          disabled={pending}
          className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Reading…" : "Import from PDF"}
        </button>
      </div>
    )
  }

  const cell = "w-full bg-transparent px-3 py-2 outline-none"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border-2 border-mfa-red p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Importing {phase.omas.length} OMAs for</span>
          <select
            value={phase.subjectId}
            onChange={(e) => setPhase({ ...phase, subjectId: e.target.value })}
            className="rounded border border-mfa-track px-2 py-1.5"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Period</span>
          <select
            value={phase.periodId}
            onChange={(e) => setPhase({ ...phase, periodId: e.target.value })}
            className="rounded border border-mfa-track px-2 py-1.5"
          >
            <option value="" disabled>
              Choose a period
            </option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className="w-full text-xs text-mfa-muted">
          AI-drafted from <code>{phase.draft.filename}</code>. Check every field — targets and
          statuses especially.
        </p>
      </div>

      {phase.draft.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-semibold">Check these before creating:</p>
          <ul className="mt-1 list-disc pl-5">
            {phase.draft.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {phase.omas.map((oma, omaIndex) => {
        const setOma = (patch: Partial<ReviewOma>) =>
          setPhase({
            ...phase,
            omas: phase.omas.map((o, i) => (i === omaIndex ? { ...o, ...patch } : o)),
          })
        const removeOma = () =>
          setPhase({ ...phase, omas: phase.omas.filter((_, i) => i !== omaIndex) })

        const blockers = draftOmaBlockers({
          title: oma.title,
          outcome: oma.outcome,
          metrics: oma.metrics.map((m) => ({
            measure: m.measure,
            unit: m.unit,
            direction: m.direction,
            target: parseAmount(m.target) ?? 0,
            targetText: m.targetText,
          })),
          actions: oma.actions,
        })

        return (
          <div key={omaIndex} className="overflow-hidden rounded-2xl border-2 border-mfa-red">
            <div className="flex items-center justify-between gap-3 bg-mfa-red px-5 py-3 text-white">
              <span className="font-bold">Draft OMA {omaIndex + 1}</span>
              <button type="button" onClick={removeOma} className="text-sm text-white/80 hover:text-white">
                Remove this OMA
              </button>
            </div>

            <div className="border-b border-mfa-track px-5 py-3">
              <input
                value={oma.title}
                placeholder="Title"
                onChange={(e) => setOma({ title: e.target.value })}
                className="w-full border-b border-mfa-track bg-transparent py-1 text-lg font-bold outline-none focus:border-mfa-red"
              />
            </div>

            <section className="border-b border-mfa-track">
              <div className="bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">OUTCOME</div>
              <textarea value={oma.outcome} onChange={(e) => setOma({ outcome: e.target.value })} rows={2} className={cell} />
            </section>

            <section className="border-b border-mfa-track">
              <div className="bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">METRIC / KPI</div>
              {oma.metrics.map((m, mi) => {
                const setM = (patch: Partial<ReviewMetric>) =>
                  setOma({ metrics: oma.metrics.map((x, j) => (j === mi ? { ...x, ...patch } : x)) })
                const removeM = () => setOma({ metrics: oma.metrics.filter((_, j) => j !== mi) })
                return (
                  <div
                    key={mi}
                    className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-mfa-track px-5 py-4 text-sm first:border-t-0"
                  >
                    <label className="flex w-full flex-col">
                      <span className="text-xs text-mfa-muted">KPI</span>
                      <input
                        value={m.measure}
                        onChange={(e) => setM({ measure: e.target.value })}
                        className="border-b border-mfa-track bg-transparent py-1 font-semibold outline-none focus:border-mfa-red"
                      />
                    </label>
                    <label className="flex flex-col">
                      <span className="text-xs text-mfa-muted">Unit</span>
                      <select
                        value={m.unit}
                        onChange={(e) => setM({ unit: e.target.value as MetricUnit })}
                        className="rounded border border-mfa-track bg-white px-2 py-1.5"
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
                            onClick={() => setM({ direction: d })}
                            className={`px-2.5 py-1.5 ${m.direction === d ? "bg-mfa-red text-white" : "text-mfa-muted"}`}
                          >
                            {d === "HIGHER_BETTER" ? "↑ Higher" : "↓ Lower"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex w-32 flex-col">
                      <span className="text-xs text-mfa-muted">Target</span>
                      <input
                        value={m.target}
                        placeholder="0"
                        onChange={(e) => setM({ target: num(e.target.value) })}
                        className="rounded border border-mfa-track px-2 py-1.5"
                      />
                    </label>
                    <button type="button" onClick={removeM} className="px-2 text-mfa-muted">
                      ✕
                    </button>
                    {(hint(m.target, m.unit) || (!m.target && m.targetText)) && (
                      <div className="w-full text-xs text-mfa-muted">
                        {hint(m.target, m.unit) && <span>Resolves to: {hint(m.target, m.unit)}</span>}
                        {m.targetText && <span className="ml-4 italic">From PDF: &quot;{m.targetText}&quot;</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="px-5 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setOma({
                      metrics: [
                        ...oma.metrics,
                        { measure: "", unit: "NUMBER", direction: "HIGHER_BETTER", target: "", targetText: "" },
                      ],
                    })
                  }
                  className="text-sm text-mfa-red"
                >
                  + Add KPI
                </button>
              </div>
            </section>

            <section>
              <div className="bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">ACTIONS</div>
              {oma.actions.map((a, ai) => {
                const setA = (patch: Partial<ReviewAction>) =>
                  setOma({ actions: oma.actions.map((x, j) => (j === ai ? { ...x, ...patch } : x)) })
                const removeA = () => setOma({ actions: oma.actions.filter((_, j) => j !== ai) })
                return (
                  <div
                    key={ai}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border-t border-mfa-track px-3 py-2 first:border-t-0"
                  >
                    <input
                      type="checkbox"
                      checked={a.completed}
                      onChange={(e) => setA({ completed: e.target.checked })}
                      className="h-4 w-4 accent-mfa-red"
                    />
                    <input
                      value={a.description}
                      onChange={(e) => setA({ description: e.target.value })}
                      className={cell}
                    />
                    <div className="flex flex-col text-xs text-mfa-muted">
                      <input
                        type="date"
                        value={a.dueDate ?? ""}
                        onChange={(e) => setA({ dueDate: e.target.value || null })}
                        className="bg-transparent py-1 outline-none"
                      />
                      {a.statusText && <span className="italic">From PDF: &quot;{a.statusText}&quot;</span>}
                    </div>
                    <button type="button" onClick={removeA} className="px-2 text-mfa-muted">
                      ✕
                    </button>
                  </div>
                )
              })}
              <div className="px-5 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setOma({ actions: [...oma.actions, { description: "", dueDate: null, completed: false, statusText: "" }] })
                  }
                  className="text-sm text-mfa-red"
                >
                  + Add action
                </button>
              </div>
            </section>

            {blockers.length > 0 && (
              <p className="border-t border-mfa-track px-5 py-2 text-sm font-semibold text-mfa-red">
                Won&apos;t save yet: {blockers.join(" ")}
              </p>
            )}
          </div>
        )
      })}

      <div className="flex items-center justify-end gap-3">
        {error && (
          <p role="alert" className="mr-auto text-sm font-semibold text-mfa-red">
            {error}
          </p>
        )}
        <button type="button" onClick={() => setPhase({ kind: "upload" })} className="text-sm text-mfa-muted">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={
            pending ||
            phase.omas.length === 0 ||
            !phase.periodId ||
            phase.omas.some(
              (o) =>
                draftOmaBlockers({
                  title: o.title,
                  outcome: o.outcome,
                  metrics: o.metrics.map((m) => ({
                    measure: m.measure,
                    unit: m.unit,
                    direction: m.direction,
                    target: parseAmount(m.target) ?? 0,
                    targetText: m.targetText,
                  })),
                  actions: o.actions,
                }).length > 0,
            )
          }
          className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : `Create ${phase.omas.length} OMAs`}
        </button>
      </div>
    </div>
  )
}
