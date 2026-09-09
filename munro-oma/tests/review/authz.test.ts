import { describe, expect, it } from "vitest"
import {
  canBatchOpen,
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
})

describe("canReassignScorer / canDeleteReview", () => {
  it("admin only", () => {
    expect(canReassignScorer(admin)).toBe(true)
    expect(canReassignScorer(mgr)).toBe(false)
    expect(canDeleteReview(admin)).toBe(true)
    expect(canDeleteReview(mgr)).toBe(false)
  })
})
