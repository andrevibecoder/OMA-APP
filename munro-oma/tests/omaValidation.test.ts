import { describe, expect, it } from "vitest"
import { omaSaveBlockers } from "@/lib/omaValidation"

const okMetric = { measure: "New-business revenue", target: 500000 }
const ok = { title: "Grow the client base", outcome: "Grow the client base", metrics: [okMetric] }

describe("omaSaveBlockers", () => {
  it("returns no blockers when a title, an outcome and one complete metric are present", () => {
    expect(omaSaveBlockers(ok)).toEqual([])
  })

  it("blocks a blank title", () => {
    expect(omaSaveBlockers({ ...ok, title: "" })).toContain("Add a title before saving.")
  })

  it("blocks a whitespace-only title", () => {
    expect(omaSaveBlockers({ ...ok, title: "   " })).toContain("Add a title before saving.")
  })

  it("blocks a blank / whitespace-only outcome", () => {
    expect(omaSaveBlockers({ ...ok, outcome: "   " })).toContain("Add an outcome before saving.")
  })

  it("blocks when there are no metrics at all", () => {
    expect(omaSaveBlockers({ ...ok, metrics: [] })).toContain("Add at least one KPI with a target.")
  })

  it("blocks when the only metric row is untouched (no name, no target)", () => {
    expect(omaSaveBlockers({ ...ok, metrics: [{ measure: "", target: 0 }] })).toContain(
      "Add at least one KPI with a target.",
    )
  })

  it("ignores an untouched extra metric row when another metric is complete", () => {
    expect(
      omaSaveBlockers({ ...ok, metrics: [okMetric, { measure: "  ", target: 0 }] }),
    ).toEqual([])
  })

  it("blocks a metric that has a target but no name (the silent-drop case)", () => {
    expect(
      omaSaveBlockers({ ...ok, metrics: [{ measure: "  ", target: 600 }] }),
    ).toContain("Every KPI needs both a name and a target.")
  })

  it("blocks a metric that has a name but no target", () => {
    expect(
      omaSaveBlockers({ ...ok, metrics: [{ measure: "Call volume", target: 0 }] }),
    ).toContain("Every KPI needs both a name and a target.")
  })

  it("does not also nag 'add at least one' when a partial row is the problem", () => {
    expect(
      omaSaveBlockers({ ...ok, metrics: [{ measure: "Call volume", target: 0 }] }),
    ).not.toContain("Add at least one KPI with a target.")
  })

  it("reports every distinct problem at once", () => {
    expect(omaSaveBlockers({ title: "", outcome: "", metrics: [] })).toEqual([
      "Add a title before saving.",
      "Add an outcome before saving.",
      "Add at least one KPI with a target.",
    ])
  })

  it("treats a negative target as not a target", () => {
    expect(
      omaSaveBlockers({ ...ok, metrics: [{ measure: "Revenue", target: -5 }] }),
    ).toContain("Every KPI needs both a name and a target.")
  })
})
