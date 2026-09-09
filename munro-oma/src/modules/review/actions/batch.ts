"use server"

import { revalidatePath } from "next/cache"
import type { Prisma as PrismaNS } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { getOmasForReview } from "@/lib/omaForReview"
import { canBatchOpen } from "@/modules/review/authz"
import { buildItems } from "@/modules/review/snapshot"
import { subjectsToOpen } from "@/modules/review/openSelection"
import { getEligibleSubjectIds } from "@/modules/review/queries"

export async function batchOpenReviews(periodId: string): Promise<void> {
  const viewer = await getSessionUser()
  if (!canBatchOpen(viewer)) throw new Error("Not allowed")
  await db.period.findUniqueOrThrow({ where: { id: periodId }, select: { id: true } })

  const [eligible, existing] = await Promise.all([
    getEligibleSubjectIds(periodId),
    db.review.findMany({ where: { periodId }, select: { subjectId: true } }),
  ])
  const targets = subjectsToOpen(
    eligible,
    existing.map((r) => r.subjectId),
  )

  for (const subjectId of targets) {
    const subject = await db.user.findUniqueOrThrow({
      where: { id: subjectId },
      select: { managerId: true },
    })
    const omas = await getOmasForReview(subjectId, periodId)
    if (omas.length === 0) continue // guard: eligibility already implies >=1, belt & braces
    const items = buildItems(omas)
    await withDbRetry(() =>
      db.review.create({
        data: {
          subjectId,
          scorerId: subject.managerId ?? viewer.id,
          periodId,
          createdById: viewer.id,
          items: {
            create: items.map((it) => ({
              omaId: it.omaId,
              order: it.order,
              sequence: it.sequence,
              title: it.title,
              outcome: it.outcome,
              kpis: it.kpis as unknown as PrismaNS.InputJsonValue,
              actions: it.actions as unknown as PrismaNS.InputJsonValue,
            })),
          },
        },
      }),
    )
  }

  revalidatePath("/admin/reviews")
  revalidatePath("/review")
}
