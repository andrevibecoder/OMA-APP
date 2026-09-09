import { describe, expect, it } from "vitest"
import {
  canBatchOpen,
  canBeScorer,
  canDeleteReview,
  canOpenAdHocFor,
  canReassignScorer,
  canScore,
  canViewScorecard,
  type ReviewAuthShape,
} from "@/modules/review/authz"
import type { SessionUser } from "@/types"

const admin: SessionUser = { id: "admin", name: "A", role: "ADMIN", businessUnitId: null, managerId: null }
const mgr: SessionUser = { id: "mgr", name: "M", role: "MANAGER", businessUnitId: "bu1", managerId: "boss" }
const other: SessionUser = { id: "mgr2", name: "M2", role: "MANAGER", businessUnitId: "bu1", managerId: "boss" }
const user: SessionUser = { id: "u1", name: "U", role: "USER", businessUnitId: "bu1", managerId: "mgr" }

const openReview: ReviewAuthShape = {
  subjectId: "u1",
  subject: { managerId: "mgr" },
  scorerId: "mgr",
  status: "OPEN",
}
const completed: ReviewAuthShape = { ...openReview, status: "COMPLETED" }
// Scorer's account deleted → onDelete: SetNull leaves scorerId null.
const unassigned: ReviewAuthShape = { ...openReview, scorerId: null }
// A subject with no line manager at all.
const noManager: ReviewAuthShape = {
  ...openReview,
  subject: { managerId: null },
  scorerId: "admin",
}

describe("canBatchOpen", () => {
  it("admin only", () => {
    expect(canBatchOpen(admin)).toBe(true)
    expect(canBatchOpen(mgr)).toBe(false)
    expect(canBatchOpen(user)).toBe(false)
  })
})

describe("canOpenAdHocFor", () => {
  it("admin: anyone", () => expect(canOpenAdHocFor(admin, { id: "x", managerId: null })).toBe(true))
  it("manager: only their own team", () => {
    expect(canOpenAdHocFor(mgr, { id: "u1", managerId: "mgr" })).toBe(true)
    expect(canOpenAdHocFor(mgr, { id: "u2", managerId: "other" })).toBe(false)
  })
  it("user: never", () => expect(canOpenAdHocFor(user, { id: "u1", managerId: "mgr" })).toBe(false))
})

describe("canScore", () => {
  it("admin: any review", () => expect(canScore(admin, openReview)).toBe(true))
  it("manager: only where they are the scorer", () => {
    expect(canScore(mgr, openReview)).toBe(true)
    expect(canScore(other, openReview)).toBe(false)
  })
  it("user: never", () => expect(canScore(user, openReview)).toBe(false))
  it("still true on a completed review (needed for reopen)", () =>
    expect(canScore(mgr, completed)).toBe(true))
  it("a demoted manager still sitting on scorerId: never", () => {
    const demoted: SessionUser = { ...mgr, role: "USER" }
    expect(demoted.id).toBe(openReview.scorerId) // they *are* the scorer
    expect(canScore(demoted, openReview)).toBe(false)
  })
  it("an unassigned scorer (deleted account): admin only", () => {
    expect(canScore(admin, unassigned)).toBe(true)
    expect(canScore(mgr, unassigned)).toBe(false)
    expect(canScore(user, unassigned)).toBe(false)
  })
})

describe("canViewScorecard", () => {
  it("admin: always", () => {
    expect(canViewScorecard(admin, openReview)).toBe(true)
    expect(canViewScorecard(admin, completed)).toBe(true)
  })
  it("scorer: always", () => expect(canViewScorecard(mgr, openReview)).toBe(true))
  it("a manager who manages the subject but is not the scorer: always", () => {
    const r: ReviewAuthShape = { ...openReview, scorerId: "admin" }
    expect(canViewScorecard(mgr, r)).toBe(true)
  })
  it("subject: only their own AND only once completed", () => {
    expect(canViewScorecard(user, openReview)).toBe(false)
    expect(canViewScorecard(user, completed)).toBe(true)
  })
  it("an unrelated user: never", () => {
    const stranger: SessionUser = { ...user, id: "u9" }
    expect(canViewScorecard(stranger, completed)).toBe(false)
  })
  it("a demoted manager of the subject: no longer sees the OPEN scorecard", () => {
    const demoted: SessionUser = { ...mgr, role: "USER" }
    const r: ReviewAuthShape = { ...openReview, scorerId: "admin" }
    expect(r.subject.managerId).toBe(demoted.id) // still their line manager on paper
    expect(canViewScorecard(demoted, r)).toBe(false)
  })
  it("a demoted manager still on scorerId: no longer sees the OPEN scorecard", () => {
    const demoted: SessionUser = { ...mgr, role: "USER" }
    expect(demoted.id).toBe(openReview.scorerId) // they *are* the scorer
    expect(canViewScorecard(demoted, openReview)).toBe(false)
    // …and the one USER route in still works: their own, completed.
    const own: ReviewAuthShape = { ...completed, subjectId: demoted.id }
    expect(canViewScorecard(demoted, own)).toBe(true)
  })
  it("a subject with no line manager: no manager route in", () => {
    expect(canViewScorecard(mgr, noManager)).toBe(false)
    expect(canViewScorecard(other, noManager)).toBe(false)
  })
})

describe("canBeScorer", () => {
  it("a manager or admin may be assigned", () => {
    expect(canBeScorer({ role: "MANAGER" })).toBe(true)
    expect(canBeScorer({ role: "ADMIN" })).toBe(true)
  })
  it("a demoted (USER-role) line manager may not", () =>
    expect(canBeScorer({ role: "USER" })).toBe(false))
  it("no line manager at all: false", () => {
    expect(canBeScorer(null)).toBe(false)
    expect(canBeScorer(undefined)).toBe(false)
  })
})

describe("canReassignScorer / canDeleteReview", () => {
  it("admin only", () => {
    expect(canReassignScorer(admin)).toBe(true)
    expect(canReassignScorer(mgr)).toBe(false)
    expect(canDeleteReview(admin)).toBe(true)
    expect(canDeleteReview(mgr)).toBe(false)
  })
  it("a plain user: never", () => {
    expect(canReassignScorer(user)).toBe(false)
    expect(canDeleteReview(user)).toBe(false)
  })
})
