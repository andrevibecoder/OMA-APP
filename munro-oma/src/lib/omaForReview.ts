// Read-only. The single point of contact between the Review module and OMA data.
// Additive file — no existing OMA code is changed. If OMA ever becomes its own
// module this file moves there and nothing else changes.
import type { MetricDirection, MetricUnit } from "@prisma/client"
import { db } from "@/lib/db"

export type OmaForReviewKpi = {
  measure: string
  unit: MetricUnit
  direction: MetricDirection
  target: number
  current: number
}

export type OmaForReviewAction = {
  description: string
  dueDate: Date | null
  completed: boolean
}

export type OmaForReview = {
  omaId: string
  sequence: number
  title: string
  outcome: string
  kpis: OmaForReviewKpi[]
  actions: OmaForReviewAction[]
}

type OmaRow = {
  id: string
  sequence: number
  title: string
  outcome: string
  metrics: (OmaForReviewKpi & { order: number })[]
  actions: (OmaForReviewAction & { order: number })[]
}

export function mapOmaForReview(row: OmaRow): OmaForReview {
  return {
    omaId: row.id,
    sequence: row.sequence,
    title: row.title,
    outcome: row.outcome,
    kpis: row.metrics.map((m) => ({
      measure: m.measure,
      unit: m.unit,
      direction: m.direction,
      target: m.target,
      current: m.current,
    })),
    actions: row.actions.map((a) => ({
      description: a.description,
      dueDate: a.dueDate,
      completed: a.completed,
    })),
  }
}

export async function getOmasForReview(
  userId: string,
  periodId: string,
): Promise<OmaForReview[]> {
  const omas = await db.oMA.findMany({
    where: { ownerId: userId, periodId },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      sequence: true,
      title: true,
      outcome: true,
      metrics: {
        orderBy: { order: "asc" },
        select: {
          measure: true,
          unit: true,
          direction: true,
          target: true,
          current: true,
          order: true,
        },
      },
      actions: {
        orderBy: { order: "asc" },
        select: { description: true, dueDate: true, completed: true, order: true },
      },
    },
  })
  return omas.map(mapOmaForReview)
}
