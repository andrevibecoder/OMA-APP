import type { ReviewStatus } from "@prisma/client"
import type { Role, SessionUser } from "@/types"

export type ReviewAuthShape = {
  subjectId: string
  subject: { managerId: string | null }
  // Null once the scorer's account is deleted — only an ADMIN can score then.
  scorerId: string | null
  status: ReviewStatus
}

// A line-manager relationship only counts while that person still holds the
// MANAGER role — an admin can demote someone without clearing `managerId`.
function managesSubject(u: SessionUser, r: ReviewAuthShape): boolean {
  if (u.role !== "MANAGER") return false
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
  // A demoted manager stays on `scorerId` but must not keep scoring.
  if (u.role === "USER") return false
  return r.scorerId === u.id
}

// Who may be *assigned* as a review's scorer. `subject.managerId` is independent
// of `role`, so a demoted line manager must not be picked up as the scorer.
export function canBeScorer(manager: { role: Role } | null | undefined): boolean {
  if (!manager) return false
  return manager.role === "MANAGER" || manager.role === "ADMIN"
}

export function canReassignScorer(u: SessionUser): boolean {
  return u.role === "ADMIN"
}

export function canViewScorecard(u: SessionUser, r: ReviewAuthShape): boolean {
  if (u.role === "ADMIN") return true
  // The subject's own scorecard — and only once completed. Checked before the
  // scorer/manager branches so nobody reads their own review while it is open.
  if (r.subjectId === u.id) return r.status === "COMPLETED"
  // A USER has exactly one way in, above. A demoted manager left on `scorerId`
  // (or on a report's `managerId`) must not keep reading their reports'
  // scorecards — spec §7 gives USER ❌ on every such row.
  if (u.role === "USER") return false
  if (r.scorerId === u.id) return true
  if (managesSubject(u, r)) return true
  return false
}

export function canDeleteReview(u: SessionUser): boolean {
  return u.role === "ADMIN"
}
