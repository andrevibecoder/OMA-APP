// Pure builder for "carry this OMA over to another period" — the payload for a
// single db.oMA.create({ data }) with nested metric/action creates. Everything
// copies across as-is: KPI current values, and actions keep their completed
// state and completion dates. The original OMA is never touched.
import type { MetricDirection, MetricSource, MetricUnit } from "@prisma/client"

type SourceMetric = {
  measure: string
  unit: MetricUnit
  direction: MetricDirection
  target: number
  current: number
  order: number
  source: MetricSource
  apiUrl: string | null
  apiPath: string | null
  apiKey: string | null
}

type SourceAction = {
  description: string
  dueDate: Date | null
  completed: boolean
  completedAt: Date | null
  order: number
}

export type CopyOmaSource = {
  ownerId: string
  title: string
  outcome: string
  endDate: Date | null
  metrics: SourceMetric[]
  actions: SourceAction[]
}

export type CopyOmaTarget = {
  periodId: string
  startDate: Date
}

export function buildCopiedOmaData(
  source: CopyOmaSource,
  target: CopyOmaTarget,
  sequence: number,
  creatorId: string,
) {
  return {
    ownerId: source.ownerId,
    createdById: creatorId,
    periodId: target.periodId,
    sequence,
    date: target.startDate,
    endDate: source.endDate,
    title: source.title,
    outcome: source.outcome,
    metrics: {
      create: source.metrics.map((m) => ({
        measure: m.measure,
        unit: m.unit,
        direction: m.direction,
        target: m.target,
        current: m.current,
        order: m.order,
        source: m.source,
        apiUrl: m.apiUrl,
        apiPath: m.apiPath,
        apiKey: m.apiKey,
      })),
    },
    actions: {
      create: source.actions.map((a) => ({
        description: a.description,
        dueDate: a.dueDate,
        completed: a.completed,
        completedAt: a.completedAt,
        order: a.order,
      })),
    },
  }
}
