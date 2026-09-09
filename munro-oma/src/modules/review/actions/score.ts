"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { Prisma as PrismaNS } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { canScore } from "@/modules/review/authz"
import type { ItemNote } from "@/modules/review/snapshot"

async function loadOpenItemForScorer(reviewId: string, itemId: string) {
  const viewer = await getSessionUser()
  const review = await db.review.findUniqueOrThrow({
    where: { id: reviewId },
    select: {
      status: true,
      scorerId: true,
      subjectId: true,
      subject: { select: { managerId: true } },
      items: { where: { id: itemId }, select: { id: true, notes: true } },
    },
  })
  const shape = {
    subjectId: review.subjectId,
    subject: { managerId: review.subject.managerId },
    scorerId: review.scorerId,
    status: review.status,
  }
  if (!canScore(viewer, shape)) throw new Error("Not allowed")
  if (review.status !== "OPEN") throw new Error("This review is completed.")
  const item = review.items[0]
  if (!item) throw new Error("Unknown scorecard item.")
  return item
}

const ratingSchema = z.enum(["BELOW", "MEETS", "EXCEEDS"])

export async function setItemRating(
  reviewId: string,
  itemId: string,
  rating: z.infer<typeof ratingSchema>,
): Promise<void> {
  ratingSchema.parse(rating)
  await loadOpenItemForScorer(reviewId, itemId)
  await withDbRetry(() => db.reviewItem.update({ where: { id: itemId }, data: { rating } }))
  revalidatePath(`/review/${reviewId}`)
  revalidatePath("/admin/reviews")
}

export async function setItemComment(
  reviewId: string,
  itemId: string,
  comment: string,
): Promise<void> {
  const clean = z.string().max(4000).parse(comment)
  await loadOpenItemForScorer(reviewId, itemId)
  await withDbRetry(() =>
    db.reviewItem.update({
      where: { id: itemId },
      data: { comment: clean.trim() || null },
    }),
  )
  revalidatePath(`/review/${reviewId}`)
  revalidatePath("/admin/reviews")
}

export async function setItemNote(
  reviewId: string,
  itemId: string,
  ref: string,
  kind: "kpi" | "action",
  text: string,
): Promise<void> {
  const clean = z.string().max(2000).parse(text).trim()
  z.enum(["kpi", "action"]).parse(kind)
  const item = await loadOpenItemForScorer(reviewId, itemId)
  const notes = ((item.notes as unknown as ItemNote[]) ?? []).filter((n) => n.ref !== ref)
  if (clean) notes.push({ ref, kind, text: clean })
  await withDbRetry(() =>
    db.reviewItem.update({
      where: { id: itemId },
      data: { notes: notes as unknown as PrismaNS.InputJsonValue },
    }),
  )
  revalidatePath(`/review/${reviewId}`)
  revalidatePath("/admin/reviews")
}
