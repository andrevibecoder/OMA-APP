import { describe, expect, it } from "vitest"
import { buildItems } from "@/modules/review/snapshot"
import type { OmaForReview } from "@/lib/omaForReview"

// deterministic ref generator: r0, r1, r2, ...
const seq = () => {
  let n = 0
  return () => `r${n++}`
}

const oma = (over: Partial<OmaForReview> = {}): OmaForReview => ({
  omaId: "oma1",
  sequence: 1,
  title: "HR Effectiveness",
  outcome: "Efficient and effective HR.",
  kpis: [
    { measure: "eNPS", unit: "PERCENT", direction: "HIGHER_BETTER", target: 100, current: 78 },
  ],
  actions: [{ description: "Roll out onboarding", dueDate: null, completed: false }],
  ...over,
})

describe("buildItems", () => {
  it("creates one item per OMA with order = index and a ref on every kpi/action", () => {
    const items = buildItems([oma(), oma({ omaId: "oma2", sequence: 2 })], seq())
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ omaId: "oma1", order: 0, sequence: 1, title: "HR Effectiveness" })
    expect(items[1]).toMatchObject({ omaId: "oma2", order: 1 })
    expect(items[0].kpis[0].ref).toBe("r0")
    expect(items[0].actions[0].ref).toBe("r1")
  })

  it("carries every KPI and action field into the snapshot", () => {
    const [item] = buildItems(
      [oma({ actions: [{ description: "Ship it", dueDate: new Date("2026-10-01"), completed: true }] })],
      seq(),
    )
    expect(item.kpis[0]).toMatchObject({ measure: "eNPS", target: 100, current: 78 })
    expect(item.actions[0]).toMatchObject({ description: "Ship it", completed: true })
  })

  it("returns an empty list for a person with no OMAs", () => {
    expect(buildItems([], seq())).toEqual([])
  })
})
