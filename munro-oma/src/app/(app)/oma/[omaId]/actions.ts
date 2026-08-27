"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canEditActions, canEditOutcomeMetric } from "@/lib/authz"
import type { SaveOmaInput } from "@/types"

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
  await db.action.update({
    where: { id: actionId },
    data: { completed, completedAt: completed ? new Date() : null },
  })
  revalidatePath(`/oma/${action.oma.id}`)
  revalidatePath(`/person/${action.oma.ownerId}`)
  if (action.oma.owner.businessUnitId) revalidatePath(`/bu/${action.oma.owner.businessUnitId}`)
  revalidatePath("/")
}

export async function saveOma(input: SaveOmaInput): Promise<void> {
  const viewer = await getSessionUser()
  const oma = await db.oMA.findUniqueOrThrow({
    where: { id: input.omaId },
    include: {
      owner: { select: { id: true, managerId: true, businessUnitId: true } },
      actions: { select: { id: true } },
    },
  })
  const authShape = { ownerId: oma.owner.id, owner: { managerId: oma.owner.managerId } }
  const mayOutcome = canEditOutcomeMetric(viewer, authShape)
  const mayActions = canEditActions(viewer, authShape)
  if (!mayOutcome && !mayActions) throw new Error("Not allowed")

  if (mayOutcome) {
    await db.oMA.update({ where: { id: oma.id }, data: { outcome: input.outcome } })
    await db.metric.deleteMany({ where: { omaId: oma.id } })
    const metrics = input.metrics
      .filter((m) => m.measure.trim() || m.target.trim())
      .map((m, i) => ({ omaId: oma.id, measure: m.measure, target: m.target, order: i }))
    if (metrics.length > 0) {
      await db.metric.createMany({ data: metrics })
    }
  }

  if (mayActions) {
    const ownIds = new Set(oma.actions.map((a) => a.id))
    const keepIds = new Set(
      input.actions.filter((a) => a.id && ownIds.has(a.id)).map((a) => a.id as string),
    )
    const toDelete = oma.actions.filter((a) => !keepIds.has(a.id)).map((a) => a.id)
    if (toDelete.length) await db.action.deleteMany({ where: { id: { in: toDelete } } })
    for (let i = 0; i < input.actions.length; i++) {
      const a = input.actions[i]
      const due = a.dueDate ? new Date(a.dueDate) : null
      if (a.id && !ownIds.has(a.id)) {
        continue
      }
      if (a.id) {
        await db.action.update({
          where: { id: a.id },
          data: {
            description: a.description,
            dueDate: due,
            completed: a.completed,
            completedAt: a.completed ? new Date() : null,
            order: i,
          },
        })
      } else if (a.description.trim()) {
        await db.action.create({
          data: {
            omaId: oma.id,
            description: a.description,
            dueDate: due,
            completed: a.completed,
            completedAt: a.completed ? new Date() : null,
            order: i,
          },
        })
      }
    }
  }

  revalidatePath(`/oma/${oma.id}`)
  revalidatePath(`/person/${oma.owner.id}`)
  if (oma.owner.businessUnitId) revalidatePath(`/bu/${oma.owner.businessUnitId}`)
  revalidatePath("/")
  redirect(`/oma/${oma.id}`)
}
