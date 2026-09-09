"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { getOmasForReview } from "@/lib/omaForReview"
import { canOpenAdHocFor } from "@/modules/review/authz"
import { buildItems } from "@/modules/review/snapshot"

export async function openAdHocReview(subjectId: string, periodId: string): Promise<void> {
  const viewer = await getSessionUser()
  const subject = await db.user.findUniqueOrThrow({
    where: { id: subjectId },
    select: { id: true, managerId: true },
  })
  if (!canOpenAdHocFor(viewer, subject)) throw new Error("Not allowed")

  const period = await db.period.findUniqueOrThrow({
    where: { id: periodId },
    select: { id: true },
  })

  const omas = await getOmasForReview(subjectId, periodId)
  if (omas.length === 0) throw new Error("This person has no OMAs to review this period.")

  const items = buildItems(omas)
  const scorerId = subject.managerId ?? viewer.id

  let review
  try {
    review = await withDbRetry(() =>
      db.review.create({
        data: {
          subjectId,
          scorerId,
          periodId: period.id,
          createdById: viewer.id,
          items: {
            create: items.map((it) => ({
              omaId: it.omaId,
              order: it.order,
              sequence: it.sequence,
              title: it.title,
              outcome: it.outcome,
              kpis: it.kpis as unknown as Prisma.InputJsonValue,
              actions: it.actions as unknown as Prisma.InputJsonValue,
            })),
          },
        },
      }),
    )
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("A review already exists for this person and period.")
    }
    throw e
  }

  revalidatePath(`/person/${subjectId}`)
  revalidatePath("/review")
  redirect(`/review/${review.id}`)
}
