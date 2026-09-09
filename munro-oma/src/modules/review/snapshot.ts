import { randomUUID } from "node:crypto"
import type { OmaRating } from "@prisma/client"
import type { OmaForReview, OmaForReviewAction, OmaForReviewKpi } from "@/lib/omaForReview"

export type SnapshotKpi = OmaForReviewKpi & { ref: string }
export type SnapshotAction = OmaForReviewAction & { ref: string }
export type ItemNote = { ref: string; kind: "kpi" | "action"; text: string }

export type NewItem = {
  omaId: string
  order: number
  sequence: number
  title: string
  outcome: string
  kpis: SnapshotKpi[]
  actions: SnapshotAction[]
}

export type ExistingItem = NewItem & {
  id: string
  rating: OmaRating | null
  comment: string | null
  notes: ItemNote[]
}

type RefreshResult = {
  create: NewItem[]
  update: { id: string; data: Omit<NewItem, "omaId"> & { rating: OmaRating | null; comment: string | null; notes: ItemNote[] } }[]
  deleteIds: string[]
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

export function buildItems(omas: OmaForReview[], makeRef: () => string = randomUUID): NewItem[] {
  return omas.map((oma, i) => snapshotOma(oma, i, makeRef))
}

// Re-attach notes to the fresh snapshot: kpi notes by matching `measure`,
// action notes by matching `description`. Notes with no text match are dropped.
function remapNotes(
  oldItem: ExistingItem,
  fresh: NewItem,
): ItemNote[] {
  const out: ItemNote[] = []
  for (const note of oldItem.notes) {
    if (note.kind === "kpi") {
      const oldKpi = oldItem.kpis.find((k) => k.ref === note.ref)
      const newKpi = oldKpi && fresh.kpis.find((k) => k.measure === oldKpi.measure)
      if (newKpi) out.push({ ref: newKpi.ref, kind: "kpi", text: note.text })
    } else {
      const oldAction = oldItem.actions.find((a) => a.ref === note.ref)
      const newAction =
        oldAction && fresh.actions.find((a) => a.description === oldAction.description)
      if (newAction) out.push({ ref: newAction.ref, kind: "action", text: note.text })
    }
  }
  return out
}

export function mergeRefresh(
  existing: ExistingItem[],
  fresh: OmaForReview[],
  makeRef: () => string = randomUUID,
): RefreshResult {
  const byOmaId = new Map(existing.map((e) => [e.omaId, e]))
  const freshOmaIds = new Set(fresh.map((o) => o.omaId))

  const create: NewItem[] = []
  const update: RefreshResult["update"] = []

  fresh.forEach((oma, i) => {
    const snap = snapshotOma(oma, i, makeRef)
    const old = byOmaId.get(oma.omaId)
    if (!old) {
      create.push(snap)
      return
    }
    update.push({
      id: old.id,
      data: {
        order: snap.order,
        sequence: snap.sequence,
        title: snap.title,
        outcome: snap.outcome,
        kpis: snap.kpis,
        actions: snap.actions,
        rating: old.rating,
        comment: old.comment,
        notes: remapNotes(old, snap),
      },
    })
  })

  const deleteIds = existing.filter((e) => !freshOmaIds.has(e.omaId)).map((e) => e.id)

  return { create, update, deleteIds }
}
