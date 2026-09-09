import { describe, expect, it } from "vitest"
import { buildItems, mergeRefresh } from "@/modules/review/snapshot"
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
})

describe("mergeRefresh", () => {
  const existing = [
    {
      id: "item1",
      omaId: "oma1",
      order: 0,
      sequence: 1,
      title: "HR Effectiveness",
      outcome: "old outcome",
      kpis: [
        { ref: "old-k", measure: "eNPS", unit: "PERCENT" as const, direction: "HIGHER_BETTER" as const, target: 100, current: 50 },
      ],
      actions: [{ ref: "old-a", description: "Roll out onboarding", dueDate: null, completed: false }],
      rating: "MEETS" as const,
      comment: "good progress",
      notes: [
        { ref: "old-k", kind: "kpi" as const, text: "trending up" },
        { ref: "old-a", kind: "action" as const, text: "started late" },
      ],
    },
  ]

  it("keeps rating and comment, re-snapshots the OMA, re-points a kpi note by measure", () => {
    const res = mergeRefresh(existing, [oma({ outcome: "new outcome" })], seq())
    expect(res.create).toEqual([])
    expect(res.deleteIds).toEqual([])
    expect(res.update).toHaveLength(1)
    const u = res.update[0]
    expect(u.id).toBe("item1")
    expect(u.data.outcome).toBe("new outcome")
    expect(u.data.rating).toBe("MEETS")
    expect(u.data.comment).toBe("good progress")
    // kpi note re-attached to the new ref because "eNPS" still exists
    const newKpiRef = u.data.kpis[0].ref
    expect(u.data.notes).toContainEqual({ ref: newKpiRef, kind: "kpi", text: "trending up" })
    const newActionRef = u.data.actions[0].ref
    expect(u.data.notes).toContainEqual({ ref: newActionRef, kind: "action", text: "started late" })
  })

  it("drops a kpi note when its measure is gone from the fresh snapshot", () => {
    const fresh = oma({
      kpis: [
        { measure: "Retention", unit: "PERCENT", direction: "HIGHER_BETTER", target: 90, current: 80 },
      ],
    })
    const res = mergeRefresh(existing, [fresh], seq())
    expect(res.update[0].data.notes).toEqual([
      // only the action note survives
      { ref: res.update[0].data.actions[0].ref, kind: "action", text: "started late" },
    ])
  })

  it("adds an unrated item for a new OMA", () => {
    const res = mergeRefresh(existing, [oma(), oma({ omaId: "oma2", sequence: 2 })], seq())
    expect(res.create).toHaveLength(1)
    expect(res.create[0].omaId).toBe("oma2")
  })

  it("deletes an item whose OMA is gone", () => {
    const res = mergeRefresh(existing, [], seq())
    expect(res.deleteIds).toEqual(["item1"])
    expect(res.update).toEqual([])
  })

  it("renumbers order to match the fresh sequence order", () => {
    const res = mergeRefresh(existing, [oma({ omaId: "oma2", sequence: 2 }), oma()], seq())
    const item1Update = res.update.find((u) => u.id === "item1")
    expect(item1Update?.data.order).toBe(1) // oma1 is now second
    expect(res.create[0].order).toBe(0)
  })
})
