"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"

export async function createOma(userId: string, periodId: string) {
  const viewer = await getSessionUser()
  const target = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, managerId: true, businessUnitId: true },
  })
  const count = await db.oMA.count({ where: { ownerId: userId, periodId } })
  if (!canCreateOMA(viewer, target, count)) throw new Error("Not allowed")

  const nextSeq = count + 1
  const oma = await db.oMA.create({
    data: { ownerId: userId, periodId, sequence: nextSeq, outcome: "" },
  })
  revalidatePath(`/person/${userId}`)
  if (target.businessUnitId) revalidatePath(`/bu/${target.businessUnitId}`)
  redirect(`/oma/${oma.id}/edit`)
}
