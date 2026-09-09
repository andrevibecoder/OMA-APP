import { db } from "@/lib/db"

export async function getReview(reviewId: string) {
  return db.review.findUnique({
    where: { id: reviewId },
    include: {
      subject: { select: { id: true, name: true, managerId: true, businessUnit: { select: { name: true } } } },
      scorer: { select: { id: true, name: true } },
      period: { select: { id: true, label: true, shortLabel: true } },
      items: { orderBy: { order: "asc" } },
    },
  })
}

export async function findReviewIdFor(subjectId: string, periodId: string): Promise<string | null> {
  const r = await db.review.findUnique({
    where: { subjectId_periodId: { subjectId, periodId } },
    select: { id: true },
  })
  return r?.id ?? null
}
