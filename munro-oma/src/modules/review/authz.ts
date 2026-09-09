import type { ReviewStatus } from "@prisma/client"
import type { SessionUser } from "@/types"

export type ReviewAuthShape = {
  subjectId: string
  subject: { managerId: string | null }
  scorerId: string
  status: ReviewStatus
}

function managesSubject(u: SessionUser, r: ReviewAuthShape): boolean {
  return r.subject.managerId !== null && r.subject.managerId === u.id
}

export function canBatchOpen(u: SessionUser): boolean {
  return u.role === "ADMIN"
}

export function canOpenAdHocFor(
  u: SessionUser,
  subject: { id: string; managerId: string | null },
): boolean {
  if (u.role === "ADMIN") return true
  if (u.role === "MANAGER") return subject.managerId !== null && subject.managerId === u.id
  return false
}

// score / comment / note / refresh / complete / reopen
export function canScore(u: SessionUser, r: ReviewAuthShape): boolean {
  if (u.role === "ADMIN") return true
  return r.scorerId === u.id
}

export function canReassignScorer(u: SessionUser): boolean {
  return u.role === "ADMIN"
}

export function canViewScorecard(u: SessionUser, r: ReviewAuthShape): boolean {
  if (u.role === "ADMIN") return true
  if (r.scorerId === u.id) return true
  if (managesSubject(u, r)) return true
  if (r.subjectId === u.id) return r.status === "COMPLETED"
  return false
}

export function canDeleteReview(u: SessionUser): boolean {
  return u.role === "ADMIN"
}
