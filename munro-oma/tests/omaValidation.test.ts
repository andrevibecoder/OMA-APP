import { describe, expect, it } from "vitest"
import { omaSaveBlockers } from "@/lib/omaValidation"

const okMetric = { measure: "New-business revenue", target: 500000 }

describe("omaSaveBlockers", () => {
  it("returns no blockers when an outcome and one complete metric are present", () => {
    expect(omaSaveBlockers({ outcome: "Grow the client base", metrics: [okMetric] })).toEqual([])
  })

  it("blocks a blank / whitespace-only outcome", () => {
    expect(omaSaveBlockers({ outcome: "   ", metrics: [okMetric] })).toContain(
      "Add an outcome before saving.",
    )
  })

  it("blocks when there are no metrics at all", () => {
    expect(omaSaveBlockers({ outcome: "Grow", metrics: [] })).toContain(
      "Add at least one KPI with a target.",
    )
  })

  it("blocks when the only metric row is untouched (no name, no target)", () => {
    expect(omaSaveBlockers({ outcome: "Grow", metrics: [{ measure: "", target: 0 }] })).toContain(
      "Add at least one KPI with a target.",
    )
  })

  it("ignores an untouched extra metric row when another metric is complete", () => {
    expect(
      omaSaveBlockers({ outcome: "Grow", metrics: [okMetric, { measure: "  ", target: 0 }] }),
    ).toEqual([])
  })

  it("blocks a metric that has a target but no name (the silent-drop case)", () => {
    expect(
      omaSaveBlockers({ outcome: "Grow", metrics: [{ measure: "  ", target: 600 }] }),
    ).toContain("Every KPI needs both a name and a target.")
  })

  it("blocks a metric that has a name but no target", () => {
    expect(
      omaSaveBlockers({ outcome: "Grow", metrics: [{ measure: "Call volume", target: 0 }] }),
    ).toContain("Every KPI needs both a name and a target.")
  })

  it("does not also nag 'add at least one' when a partial row is the problem", () => {
    expect(
      omaSaveBlockers({ outcome: "Grow", metrics: [{ measure: "Call volume", target: 0 }] }),
    ).not.toContain("Add at least one KPI with a target.")
  })

  it("reports every distinct problem at once", () => {
    expect(omaSaveBlockers({ outcome: "", metrics: [] })).toEqual([
      "Add an outcome before saving.",
      "Add at least one KPI with a target.",
    ])
  })

  it("treats a negative target as not a target", () => {
    expect(
      omaSaveBlockers({ outcome: "Grow", metrics: [{ measure: "Revenue", target: -5 }] }),
    ).toContain("Every KPI needs both a name and a target.")
  })
})
