"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { canDeleteReview, canReassignScorer, canScore } from "@/modules/review/authz"
import { canComplete, finalScore } from "@/modules/review/scoring"

async function loadForScorer(reviewId: string) {
  const viewer = await getSessionUser()
  const review = await db.review.findUniqueOrThrow({
    where: { id: reviewId },
    include: {
      subject: { select: { managerId: true } },
      items: { orderBy: { order: "asc" } },
    },
  })
  const shape = {
    subjectId: review.subjectId,
    subject: { managerId: review.subject.managerId },
    scorerId: review.scorerId,
    status: review.status,
  }
  if (!canScore(viewer, shape)) throw new Error("Not allowed")
  return { viewer, review }
}

export async function completeReview(reviewId: string): Promise<void> {
  const { review } = await loadForScorer(reviewId)
  if (review.status !== "OPEN") throw new Error("This review is already completed.")
  const items = review.items.map((i) => ({ rating: i.rating }))
  if (!canComplete(items)) throw new Error("Score every OMA before completing.")
  const now = new Date()
  await withDbRetry(() =>
    db.review.update({
      where: { id: reviewId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        reviewDate: now,
        finalScore: finalScore(items),
      },
    }),
  )
  revalidatePath(`/review/${reviewId}`)
  revalidatePath("/review")
  revalidatePath("/admin/reviews")
}

export async function reopenReview(reviewId: string): Promise<void> {
  const { review } = await loadForScorer(reviewId)
  if (review.status !== "COMPLETED") throw new Error("This review is not completed.")
  await withDbRetry(() =>
    db.review.update({
      where: { id: reviewId },
      data: { status: "OPEN", completedAt: null, reviewDate: null, finalScore: null },
    }),
  )
  revalidatePath(`/review/${reviewId}`)
  revalidatePath("/review")
  revalidatePath("/admin/reviews")
}

export async function deleteReview(reviewId: string): Promise<void> {
  const viewer = await getSessionUser()
  if (!canDeleteReview(viewer)) throw new Error("Not allowed")
  const review = await db.review.findUniqueOrThrow({
    where: { id: reviewId },
    select: { subjectId: true },
  })
  await withDbRetry(() => db.review.delete({ where: { id: reviewId } }))
  revalidatePath(`/person/${review.subjectId}`)
  revalidatePath("/review")
  redirect("/review")
}

export async function reassignScorer(reviewId: string, newScorerId: string): Promise<void> {
  const viewer = await getSessionUser()
  if (!canReassignScorer(viewer)) throw new Error("Not allowed")
  await db.user.findUniqueOrThrow({ where: { id: newScorerId }, select: { id: true } })
  try {
    await withDbRetry(() =>
      db.review.update({ where: { id: reviewId }, data: { scorerId: newScorerId } }),
    )
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) throw new Error("Could not reassign.")
    throw e
  }
  revalidatePath(`/review/${reviewId}`)
}
