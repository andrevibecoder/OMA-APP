"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canEditActions } from "@/lib/authz"

export async function tickAction(actionId: string, completed: boolean): Promise<void> {
  const viewer = await getSessionUser()
  const action = await db.action.findUniqueOrThrow({
    where: { id: actionId },
    include: { oma: { select: { id: true, ownerId: true, owner: { select: { managerId: true } } } } },
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
  revalidatePath("/")
}
