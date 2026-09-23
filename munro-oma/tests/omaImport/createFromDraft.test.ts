import { describe, expect, it } from "vitest"
import { buildCreatePayload, draftOmaBlockers } from "@/lib/omaImport/createFromDraft"
import type { DraftOma } from "@/lib/omaImport/toDraft"

const okOma: DraftOma = {
  title: "Grow revenue",
  outcome: "Grow revenue this year",
  metrics: [
    { measure: "Revenue", unit: "CURRENCY", direction: "HIGHER_BETTER", target: 3_000_000, current: 500_000, targetText: "R3 million", note: null },
  ],
  actions: [
    { description: "Launch campaign", dueDate: "2027-01-01", completed: false, statusText: "In progress" },
  ],
}

describe("draftOmaBlockers", () => {
  it("returns no blockers for a complete OMA", () => {
    expect(draftOmaBlockers(okOma)).toEqual([])
  })

  it("blocks a blank title", () => {
    expect(draftOmaBlockers({ ...okOma, title: "" })).toContain("Add a title before saving.")
  })

  it("blocks a blank outcome", () => {
    expect(draftOmaBlockers({ ...okOma, outcome: "" })).toContain("Add an outcome before saving.")
  })

  it("does not block an OMA whose only metric has a null-defaulted (zero) target — still gathering data", () => {
    expect(draftOmaBlockers({ ...okOma, metrics: [{ ...okOma.metrics[0], target: 0 }] })).toEqual([])
  })

  it("blocks more than 10 KPI rows", () => {
    const manyMetrics = Array.from({ length: 11 }, (_, i) => ({ ...okOma.metrics[0], measure: `KPI ${i}` }))
    expect(draftOmaBlockers({ ...okOma, metrics: manyMetrics })).toContain(
      "Too many KPI rows (max 10) — merge or remove some before creating.",
    )
  })

  it("blocks more than 50 actions", () => {
    const manyActions = Array.from({ length: 51 }, (_, i) => ({ ...okOma.actions[0], description: `Action ${i}` }))
    expect(draftOmaBlockers({ ...okOma, actions: manyActions })).toContain(
      "Too many actions (max 50) — remove some before creating.",
    )
  })
})

describe("buildCreatePayload", () => {
  it("builds the nested create shape with the given owner/period/sequence", () => {
    const payload = buildCreatePayload(
      okOma,
      "user-1",
      "creator-1",
      "period-1",
      2,
      new Date("2026-09-01"),
      new Date("2027-02-28"),
    )
    expect(payload.ownerId).toBe("user-1")
    expect(payload.createdById).toBe("creator-1")
    expect(payload.periodId).toBe("period-1")
    expect(payload.sequence).toBe(2)
    expect(payload.metrics.create).toHaveLength(1)
    expect(payload.metrics.create[0]).toMatchObject({
      measure: "Revenue",
      target: 3_000_000,
      current: 500_000,
      order: 0,
      source: "MANUAL",
    })
    expect(payload.actions.create).toHaveLength(1)
    expect(payload.actions.create[0]).toMatchObject({
      description: "Launch campaign",
      completed: false,
      completedAt: null,
    })
  })

  it("carries a KPI's note through as the created metric's sourceNote", () => {
    const payload = buildCreatePayload(
      { ...okOma, metrics: [{ ...okOma.metrics[0], note: "Target range collapsed to its lower bound." }] },
      "u",
      "c",
      "p",
      1,
      new Date(),
      null,
    )
    expect(payload.metrics.create[0]).toMatchObject({
      sourceNote: "Target range collapsed to its lower bound.",
    })
  })

  it("stores a null sourceNote when the KPI's note is null or blank", () => {
    const payload = buildCreatePayload(
      { ...okOma, metrics: [{ ...okOma.metrics[0], note: "   " }] },
      "u",
      "c",
      "p",
      1,
      new Date(),
      null,
    )
    expect(payload.metrics.create[0]).toMatchObject({ sourceNote: null })
  })

  it("drops a metric row with a blank measure", () => {
    const payload = buildCreatePayload(
      {
        ...okOma,
        metrics: [...okOma.metrics, { measure: "  ", unit: "NUMBER", direction: "HIGHER_BETTER", target: 5, current: 0, targetText: "", note: null }],
      },
      "u",
      "c",
      "p",
      1,
      new Date(),
      null,
    )
    expect(payload.metrics.create).toHaveLength(1)
  })

  it("drops an action row with a blank description", () => {
    const payload = buildCreatePayload(
      { ...okOma, actions: [...okOma.actions, { description: "  ", dueDate: null, completed: false, statusText: "" }] },
      "u",
      "c",
      "p",
      1,
      new Date(),
      null,
    )
    expect(payload.actions.create).toHaveLength(1)
  })

  it("stamps completedAt only for a completed action", () => {
    const payload = buildCreatePayload(
      { ...okOma, actions: [{ ...okOma.actions[0], completed: true }] },
      "u",
      "c",
      "p",
      1,
      new Date(),
      null,
    )
    expect(payload.actions.create[0].completedAt).toBeInstanceOf(Date)
  })
})
