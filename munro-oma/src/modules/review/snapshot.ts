import { randomUUID } from "node:crypto"
import type { OmaForReview, OmaForReviewAction, OmaForReviewKpi } from "@/lib/omaForReview"

export type SnapshotKpi = OmaForReviewKpi & { ref: string }
export type SnapshotAction = OmaForReviewAction & { ref: string }

export type NewItem = {
  omaId: string
  order: number
  sequence: number
  title: string
  outcome: string
  kpis: SnapshotKpi[]
  actions: SnapshotAction[]
}

function snapshotOma(oma: OmaForReview, order: number, makeRef: () => string): NewItem {
  return {
    omaId: oma.omaId,
    order,
    sequence: oma.sequence,
    title: oma.title,
    outcome: oma.outcome,
    kpis: oma.kpis.map((k) => ({ ...k, ref: makeRef() })),
    actions: oma.actions.map((a) => ({ ...a, ref: makeRef() })),
  }
}

// Freeze a person's OMAs into review items at review-open time. The snapshot is
// fixed for the life of the review — there is no in-place refresh; an admin who
// needs a current picture deletes the review and re-opens it.
export function buildItems(omas: OmaForReview[], makeRef: () => string = randomUUID): NewItem[] {
  return omas.map((oma, i) => snapshotOma(oma, i, makeRef))
}
