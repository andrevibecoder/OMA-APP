"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canEditActions, canEditOutcomeMetric } from "@/lib/authz"
import { saveOmaSchema, type SaveOmaInput } from "@/types"

export async function tickAction(actionId: string, completed: boolean): Promise<void> {
  const viewer = await getSessionUser()
  const action = await db.action.findUniqueOrThrow({
    where: { id: actionId },
    include: {
      oma: {
        select: {
          id: true,
          ownerId: true,
          owner: { select: { managerId: true, businessUnitId: true } },
        },
      },
    },
  })
  if (!canEditActions(viewer, { ownerId: action.oma.ownerId, owner: action.oma.owner })) {
    throw new Error("Not allowed")
  }
  // Preserve an existing completion timestamp; only stamp fresh on a false -> true transition.
  const completedAt = completed
    ? action.completed && action.completedAt
      ? action.completedAt
      : new Date()
    : null
  await db.action.update({
    where: { id: actionId },
    data: { completed, completedAt },
  })
  revalidatePath(`/oma/${action.oma.id}`)
  revalidatePath(`/person/${action.oma.ownerId}`)
  if (action.oma.owner.businessUnitId) revalidatePath(`/bu/${action.oma.owner.businessUnitId}`)
  revalidatePath("/")
}

export async function saveOma(input: SaveOmaInput): Promise<void> {
  const data = saveOmaSchema.parse(input)
  const viewer = await getSessionUser()
  const oma = await db.oMA.findUniqueOrThrow({
    where: { id: data.omaId },
    include: {
      owner: { select: { id: true, managerId: true, businessUnitId: true } },
      actions: { select: { id: true, completed: true, completedAt: true } },
    },
  })
  const authShape = { ownerId: oma.owner.id, owner: { managerId: oma.owner.managerId } }
  const mayOutcome = canEditOutcomeMetric(viewer, authShape)
  const mayActions = canEditActions(viewer, authShape)
  if (!mayOutcome && !mayActions) throw new Error("Not allowed")

  // Collect every write into one batch-array transaction: a single wrapped round trip
  // that works with the Supabase transaction pooler and cannot half-apply.
  const ops: Prisma.PrismaPromise<unknown>[] = []

  if (mayOutcome) {
    ops.push(db.oMA.update({ where: { id: oma.id }, data: { outcome: data.outcome } }))
    ops.push(db.metric.deleteMany({ where: { omaId: oma.id } }))
    const metrics = data.metrics
      .filter((m) => m.measure.trim())
      .map((m, i) => ({
        omaId: oma.id,
        measure: m.measure,
        unit: m.unit,
        direction: m.direction,
        target: m.target,
        current: m.current,
        order: i,
      }))
    if (metrics.length > 0) {
      ops.push(db.metric.createMany({ data: metrics }))
    }
  }

  if (mayActions) {
    const existing = new Map(oma.actions.map((a) => [a.id, a]))
    const keepIds = new Set(
      data.actions.filter((a) => a.id && existing.has(a.id)).map((a) => a.id as string),
    )
    const toDelete = oma.actions.filter((a) => !keepIds.has(a.id)).map((a) => a.id)
    if (toDelete.length) ops.push(db.action.deleteMany({ where: { id: { in: toDelete } } }))
    for (let i = 0; i < data.actions.length; i++) {
      const a = data.actions[i]
      const due = a.dueDate ? new Date(a.dueDate) : null
      // FR (26af6a4): ignore any action id that isn't one of this OMA's own actions.
      if (a.id && !existing.has(a.id)) continue
      if (a.id) {
        const prev = existing.get(a.id)!
        const completedAt = a.completed
          ? prev.completed && prev.completedAt
            ? prev.completedAt
            : new Date()
          : null
        ops.push(
          db.action.update({
            where: { id: a.id },
            data: {
              description: a.description,
              dueDate: due,
              completed: a.completed,
              completedAt,
              order: i,
            },
          }),
        )
      } else if (a.description.trim()) {
        ops.push(
          db.action.create({
            data: {
              omaId: oma.id,
              description: a.description,
              dueDate: due,
              completed: a.completed,
              completedAt: a.completed ? new Date() : null,
              order: i,
            },
          }),
        )
      }
    }
  }

  if (ops.length) await db.$transaction(ops)

  revalidatePath(`/oma/${oma.id}`)
  revalidatePath(`/person/${oma.owner.id}`)
  if (oma.owner.businessUnitId) revalidatePath(`/bu/${oma.owner.businessUnitId}`)
  revalidatePath("/")
  redirect(`/oma/${oma.id}`)
}
