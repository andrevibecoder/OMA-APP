import type { ReviewStatus } from "@prisma/client"
import { db } from "@/lib/db"
import { subjectsToOpen } from "@/modules/review/openSelection"

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

// Reviews this person has scored and completed — so a manager can still find a
// review (and its score) after finishing it. Their OPEN ones are in getReviewsToScore.
export async function getReviewsScoredBy(scorerId: string) {
  const rows = await db.review.findMany({
    where: { scorerId, status: "COMPLETED" },
    orderBy: { reviewDate: "desc" },
    select: {
      id: true,
      finalScore: true,
      reviewDate: true,
      subject: { select: { name: true } },
      period: { select: { label: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    subjectName: r.subject.name,
    periodLabel: r.period.label,
    finalScore: r.finalScore,
    reviewDate: r.reviewDate,
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
    scorerName: r.scorer?.name ?? "Unassigned",
    periodLabel: r.period.label,
    rated: r.items.filter((i) => i.rating !== null).length,
    total: r.items.length,
  }))
}

// Active users with at least one OMA in the period — the batch-open candidates.
export async function getEligibleSubjectIds(periodId: string): Promise<string[]> {
  const users = await db.user.findMany({
    where: { active: true, omas: { some: { periodId } } },
    orderBy: { name: "asc" },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

// How many reviews a batch-open would create right now — computed from the exact
// same sets `batchOpenReviews` uses, so the button never undershoots when a
// review exists for a subject who is no longer eligible.
export async function getSubjectsToOpenCount(periodId: string): Promise<number> {
  const [eligible, existing] = await Promise.all([
    getEligibleSubjectIds(periodId),
    db.review.findMany({ where: { periodId }, select: { subjectId: true } }),
  ])
  return subjectsToOpen(
    eligible,
    existing.map((r) => r.subjectId),
  ).length
}

export async function getPeriodReviewOverview(periodId: string) {
  const [eligible, reviews, completed] = await Promise.all([
    getEligibleSubjectIds(periodId).then((ids) => ids.length),
    db.review.count({ where: { periodId } }),
    db.review.count({ where: { periodId, status: "COMPLETED" } }),
  ])
  return { eligible, reviews, completed }
}
