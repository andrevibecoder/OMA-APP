import type { ReviewStatus } from "@prisma/client"
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

export async function getReviewsToScore(scorerId: string) {
  const rows = await db.review.findMany({
    where: { scorerId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: { select: { name: true } },
      period: { select: { label: true } },
      items: { select: { rating: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    subjectName: r.subject.name,
    periodLabel: r.period.label,
    rated: r.items.filter((i) => i.rating !== null).length,
    total: r.items.length,
  }))
}

export async function getMyScorecards(subjectId: string) {
  const rows = await db.review.findMany({
    where: { subjectId, status: "COMPLETED" },
    orderBy: { reviewDate: "desc" },
    select: { id: true, finalScore: true, reviewDate: true, period: { select: { label: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.period.label,
    finalScore: r.finalScore,
    reviewDate: r.reviewDate,
  }))
}

export async function getAllReviews(filter: { periodId?: string; status?: ReviewStatus } = {}) {
  const rows = await db.review.findMany({
    where: {
      periodId: filter.periodId,
      status: filter.status,
    },
    orderBy: [{ period: { startDate: "desc" } }, { subject: { name: "asc" } }],
    select: {
      id: true,
      status: true,
      finalScore: true,
      subject: { select: { name: true } },
      scorer: { select: { name: true } },
      period: { select: { label: true } },
      items: { select: { rating: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    finalScore: r.finalScore,
    subjectName: r.subject.name,
    scorerName: r.scorer.name,
    periodLabel: r.period.label,
    rated: r.items.filter((i) => i.rating !== null).length,
    total: r.items.length,
  }))
}
