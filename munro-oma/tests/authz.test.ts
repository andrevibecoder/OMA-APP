import { describe, expect, it } from "vitest"
import {
  canCreateOMA,
  canEditActions,
  canEditOma,
  canEditOutcomeMetric,
  canEditProfile,
  type OmaAuthShape,
} from "@/lib/authz"
import type { SessionUser } from "@/types"

const admin: SessionUser = { id: "admin", name: "A", role: "ADMIN", businessUnitId: "bu1", managerId: null }
const mgr: SessionUser = { id: "mgr", name: "M", role: "MANAGER", businessUnitId: "bu1", managerId: "boss" }
const user: SessionUser = { id: "u1", name: "U", role: "USER", businessUnitId: "bu1", managerId: "mgr" }

const omaOfU1: OmaAuthShape = { ownerId: "u1", owner: { managerId: "mgr" } }
const omaOfOther: OmaAuthShape = { ownerId: "u2", owner: { managerId: "other-mgr" } }

describe("canEditOutcomeMetric", () => {
  it("admin: any", () => expect(canEditOutcomeMetric(admin, omaOfOther)).toBe(true))
  it("manager: own team only", () => {
    expect(canEditOutcomeMetric(mgr, omaOfU1)).toBe(true)
    expect(canEditOutcomeMetric(mgr, omaOfOther)).toBe(false)
  })
  it("user: never", () => expect(canEditOutcomeMetric(user, omaOfU1)).toBe(false))
  it("manager: null managerId blocks", () =>
    expect(canEditOutcomeMetric(mgr, { ownerId: "x", owner: { managerId: null } })).toBe(false))
})

describe("canEditActions", () => {
  it("user: own OMA only", () => {
    expect(canEditActions(user, omaOfU1)).toBe(true)
    expect(canEditActions(user, omaOfOther)).toBe(false)
  })
  it("manager: own team", () => expect(canEditActions(mgr, omaOfU1)).toBe(true))
  it("manager: own OMA", () =>
    expect(canEditActions(mgr, { ownerId: "mgr", owner: { managerId: "boss" } })).toBe(true))
  it("manager: null managerId blocks", () =>
    expect(canEditActions(mgr, { ownerId: "x", owner: { managerId: null } })).toBe(false))
  it("manager: other team blocks", () => expect(canEditActions(mgr, omaOfOther)).toBe(false))
  it("admin: any", () => expect(canEditActions(admin, omaOfOther)).toBe(true))
})

describe("canCreateOMA", () => {
  const target = { id: "u1", managerId: "mgr" }
  it("manager for own team", () => expect(canCreateOMA(mgr, target)).toBe(true))
  it("manager not for other teams", () => expect(canCreateOMA(mgr, { id: "u2", managerId: "x" })).toBe(false))
  it("user can create their own", () =>
    expect(canCreateOMA(user, { id: "u1", managerId: "mgr" })).toBe(true))
  it("user not for someone else", () =>
    expect(canCreateOMA(user, { id: "u2", managerId: "x" })).toBe(false))
  it("admin any team", () => expect(canCreateOMA(admin, { id: "u2", managerId: "x" })).toBe(true))
})

describe("canEditProfile", () => {
  it("self only", () => {
    expect(canEditProfile(user, "u1")).toBe(true)
    expect(canEditProfile(user, "u2")).toBe(false)
  })
})

describe("canEditOma", () => {
  it("true if either sub-permission is true", () => {
    expect(canEditOma(user, omaOfU1)).toBe(true)
    expect(canEditOma(user, omaOfOther)).toBe(false)
  })
})
