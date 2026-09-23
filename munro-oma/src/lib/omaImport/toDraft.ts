import type { MetricDirection, MetricUnit } from "@prisma/client"
import type { ExtractedImport, ExtractedOma } from "./schema"

// Redeclared here (not imported from periods.ts) so this pure module has no
// dependency on the DB-touching lib — the caller (actions.ts) supplies data
// shaped like this from getPeriodsWithDates().
export type PeriodLite = { id: string; startDate: Date; endDate: Date | null }

export type DraftMetric = {
  measure: string
  unit: MetricUnit
  direction: MetricDirection
  target: number
  // Always 0 out of extraction — these documents set forward targets, not
  // report current progress. Editable on the review page for anyone
  // importing mid-period who already has a real current value to record.
  current: number
  targetText: string
  // Carried straight from the extraction — set only when this KPI's target
  // didn't fit cleanly. Editable on the review page; saved onto the metric.
  note: string | null
}

export type DraftAction = {
  description: string
  dueDate: string | null
  completed: boolean
  statusText: string
}

export type DraftOma = {
  title: string
  outcome: string
  metrics: DraftMetric[]
  actions: DraftAction[]
}

export type ImportDraft = {
  subjectName: string | null
  periodId: string | null
  filename: string
  warnings: string[]
  omas: DraftOma[]
}

function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime())
  const end = Math.min(aEnd.getTime(), bEnd.getTime())
  return Math.max(0, end - start) / (1000 * 60 * 60 * 24)
}

function matchPeriod(
  periodStart: string | null,
  periodEnd: string | null,
  periods: PeriodLite[],
): { periodId: string | null; warning: string | null } {
  if (!periodStart || !periodEnd) {
    return { periodId: null, warning: "Couldn't read the period dates from the PDF — pick one." }
  }
  const docStart = new Date(periodStart)
  const docEnd = new Date(periodEnd)
  let best: { id: string; days: number } | null = null
  for (const p of periods) {
    const pEnd = p.endDate ?? p.startDate
    const days = overlapDays(docStart, docEnd, p.startDate, pEnd)
    if (days > 0 && (!best || days > best.days)) best = { id: p.id, days }
  }
  if (!best) {
    return { periodId: null, warning: "No existing period overlaps the document's dates — pick one." }
  }
  return { periodId: best.id, warning: null }
}

// Catches "7/10", "7 out of 10", "score out of 10" — a plain number on its
// own scale, not a percentage, even when the source calls it a "score".
const SCORE_OUT_OF = /(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+)/i

// A safety net independent of the extraction prompt: whatever unit the model
// picked, a "X out of N" scale where N isn't 100 can never be a real
// percentage. Downgrades PERCENT -> NUMBER in that case and folds an
// explanation into the KPI's note so the correction isn't silent.
function correctPercentMisclassification(
  unit: MetricUnit,
  measure: string,
  targetText: string,
  note: string | null,
): { unit: MetricUnit; note: string | null } {
  if (unit !== "PERCENT") return { unit, note }
  const match = `${measure} ${targetText}`.match(SCORE_OUT_OF)
  const denominator = match ? Number(match[2]) : null
  if (denominator === null || denominator === 100) return { unit, note }
  const correction = `Unit changed from Percent to Number — this reads as a score out of ${denominator}, not a percentage.`
  return { unit: "NUMBER", note: note ? `${note} ${correction}` : correction }
}

function toDraftOma(o: ExtractedOma): { oma: DraftOma; warnings: string[] } {
  const warnings: string[] = []
  const metrics = o.kpis.map((k) => {
    const target = k.target ?? 0
    const { unit, note } = correctPercentMisclassification(
      k.unit ?? "NUMBER",
      k.measure,
      k.targetText,
      k.note,
    )
    return {
      measure: k.measure,
      unit,
      direction: k.direction ?? "HIGHER_BETTER",
      target,
      current: 0,
      targetText: k.targetText,
      note,
    }
  })
  return {
    oma: {
      title: o.title,
      outcome: o.outcome,
      metrics,
      actions: o.actions.map((a) => ({
        description: a.description,
        dueDate: a.dueDate,
        completed: a.completed,
        statusText: a.statusText,
      })),
    },
    warnings,
  }
}

export function toDraft(x: ExtractedImport, periods: PeriodLite[], filename: string): ImportDraft {
  const { periodId, warning } = matchPeriod(x.periodStart, x.periodEnd, periods)
  const results = x.omas.map(toDraftOma)
  const warnings = [
    ...x.warnings,
    ...(warning ? [warning] : []),
    ...results.flatMap((r) => r.warnings),
  ]

  return {
    subjectName: x.subjectName,
    periodId,
    filename,
    warnings: [...new Set(warnings)], // dedupe, keep first-occurrence order
    omas: results.map((r) => r.oma),
  }
}
