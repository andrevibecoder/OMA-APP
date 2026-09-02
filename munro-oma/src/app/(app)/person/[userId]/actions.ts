"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"

export async function createOma(userId: string, periodId: string) {
  const viewer = await getSessionUser()
  const target = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, managerId: true, businessUnitId: true },
  })
  const period = await db.period.findUniqueOrThrow({
    where: { id: periodId },
    select: { startDate: true, locked: true },
  })
  if (!canCreateOMA(viewer, target, period.locked)) throw new Error("Not allowed")

  const last = await db.oMA.findFirst({
    where: { ownerId: userId, periodId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  })
  const nextSeq = (last?.sequence ?? 0) + 1

  let oma
  try {
    oma = await db.oMA.create({
      data: { ownerId: userId, periodId, sequence: nextSeq, date: period.startDate, outcome: "" },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Could not create OMA — please retry.")
    }
    throw e
  }

  revalidatePath(`/person/${userId}`)
  if (target.businessUnitId) revalidatePath(`/bu/${target.businessUnitId}`)
  revalidatePath("/")
  redirect(`/oma/${oma.id}/edit`)
}
