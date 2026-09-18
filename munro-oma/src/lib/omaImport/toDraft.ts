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
  targetText: string
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

function toDraftOma(o: ExtractedOma): DraftOma {
  return {
    title: o.title,
    outcome: o.outcome,
    metrics: o.kpis.map((k) => ({
      measure: k.measure,
      unit: k.unit ?? "NUMBER",
      direction: k.direction ?? "HIGHER_BETTER",
      target: k.target ?? 0,
      targetText: k.targetText,
    })),
    actions: o.actions.map((a) => ({
      description: a.description,
      dueDate: a.dueDate,
      completed: a.completed,
      statusText: a.statusText,
    })),
  }
}

export function toDraft(x: ExtractedImport, periods: PeriodLite[], filename: string): ImportDraft {
  const { periodId, warning } = matchPeriod(x.periodStart, x.periodEnd, periods)
  const warnings = warning ? [...x.warnings, warning] : [...x.warnings]

  return {
    subjectName: x.subjectName,
    periodId,
    filename,
    warnings: [...new Set(warnings)], // dedupe, keep first-occurrence order
    omas: x.omas.map(toDraftOma),
  }
}
