import { describe, expect, it } from "vitest"
import { buildCopiedOmaData } from "@/lib/omaCopy"

const source = {
  ownerId: "user-1",
  title: "Grow new-business pipeline",
  outcome: "A predictable flow of qualified opportunities.",
  endDate: new Date("2026-06-30"),
  metrics: [
    {
      measure: "Qualified opps",
      unit: "NUMBER" as const,
      direction: "HIGHER_BETTER" as const,
      target: 40,
      current: 12,
      order: 0,
      source: "MANUAL" as const,
      apiUrl: null,
      apiPath: null,
      apiKey: null,
    },
    {
      measure: "Pipeline value",
      unit: "CURRENCY" as const,
      direction: "HIGHER_BETTER" as const,
      target: 5000000,
      current: 1800000,
      order: 1,
      source: "API" as const,
      apiUrl: "https://crm.example/pipeline",
      apiPath: "data.total",
      apiKey: "secret",
    },
  ],
  actions: [
    {
      description: "Rebuild the outreach list",
      dueDate: new Date("2026-02-15"),
      completed: true,
      completedAt: new Date("2026-02-10"),
      order: 0,
    },
    {
      description: "Book 10 discovery calls",
      dueDate: null,
      completed: false,
      completedAt: null,
      order: 1,
    },
  ],
}

const target = { periodId: "period-H2", startDate: new Date("2026-07-01") }

describe("buildCopiedOmaData", () => {
  it("carries the title, outcome and end date across unchanged", () => {
    const data = buildCopiedOmaData(source, target, 3, "manager-9")
    expect(data.title).toBe("Grow new-business pipeline")
    expect(data.outcome).toBe("A predictable flow of qualified opportunities.")
    expect(data.endDate).toEqual(new Date("2026-06-30"))
  })

  it("places the copy in the target period at the given sequence, dated from the period start", () => {
    const data = buildCopiedOmaData(source, target, 3, "manager-9")
    expect(data.periodId).toBe("period-H2")
    expect(data.sequence).toBe(3)
    expect(data.date).toEqual(new Date("2026-07-01"))
  })

  it("keeps the original owner but records the copier as creator", () => {
    const data = buildCopiedOmaData(source, target, 3, "manager-9")
    expect(data.ownerId).toBe("user-1")
    expect(data.createdById).toBe("manager-9")
  })

  it("clones every metric field, including the API-link fields, as-is", () => {
    const data = buildCopiedOmaData(source, target, 3, "manager-9")
    expect(data.metrics.create).toEqual([
      {
        measure: "Qualified opps",
        unit: "NUMBER",
        direction: "HIGHER_BETTER",
        target: 40,
        current: 12,
        order: 0,
        source: "MANUAL",
        apiUrl: null,
        apiPath: null,
        apiKey: null,
      },
      {
        measure: "Pipeline value",
        unit: "CURRENCY",
        direction: "HIGHER_BETTER",
        target: 5000000,
        current: 1800000,
        order: 1,
        source: "API",
        apiUrl: "https://crm.example/pipeline",
        apiPath: "data.total",
        apiKey: "secret",
      },
    ])
  })

  it("clones every action as-is, keeping completed state and completion dates", () => {
    const data = buildCopiedOmaData(source, target, 3, "manager-9")
    expect(data.actions.create).toEqual([
      {
        description: "Rebuild the outreach list",
        dueDate: new Date("2026-02-15"),
        completed: true,
        completedAt: new Date("2026-02-10"),
        order: 0,
      },
      {
        description: "Book 10 discovery calls",
        dueDate: null,
        completed: false,
        completedAt: null,
        order: 1,
      },
    ])
  })

  it("handles an OMA with no metrics or actions", () => {
    const bare = { ...source, endDate: null, metrics: [], actions: [] }
    const data = buildCopiedOmaData(bare, target, 1, "manager-9")
    expect(data.endDate).toBeNull()
    expect(data.metrics.create).toEqual([])
    expect(data.actions.create).toEqual([])
  })
})
