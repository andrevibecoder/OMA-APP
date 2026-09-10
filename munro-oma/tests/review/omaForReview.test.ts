import { describe, expect, it } from "vitest"
import { mapOmaForReview } from "@/lib/omaForReview"

const row = {
  id: "oma1",
  sequence: 2,
  title: "Grow pipeline",
  outcome: "A predictable flow of qualified opportunities.",
  metrics: [
    {
      measure: "Qualified opps",
      unit: "NUMBER" as const,
      direction: "HIGHER_BETTER" as const,
      target: 40,
      current: 12,
      order: 0,
    },
  ],
  actions: [
    {
      description: "Rebuild the outreach list",
      dueDate: new Date("2026-02-15"),
      completed: true,
      order: 0,
    },
    { description: "Book 10 calls", dueDate: null, completed: false, order: 1 },
  ],
}

describe("mapOmaForReview", () => {
  it("flattens a prisma OMA row to the review shape", () => {
    expect(mapOmaForReview(row)).toEqual({
      omaId: "oma1",
      sequence: 2,
      title: "Grow pipeline",
      outcome: "A predictable flow of qualified opportunities.",
      kpis: [
        {
          measure: "Qualified opps",
          unit: "NUMBER",
          direction: "HIGHER_BETTER",
          target: 40,
          current: 12,
        },
      ],
      actions: [
        { description: "Rebuild the outreach list", dueDate: new Date("2026-02-15"), completed: true },
        { description: "Book 10 calls", dueDate: null, completed: false },
      ],
    })
  })

  it("keeps metrics and actions in their given order", () => {
    const out = mapOmaForReview(row)
    expect(out.actions.map((a) => a.description)).toEqual([
      "Rebuild the outreach list",
      "Book 10 calls",
    ])
  })
})
