import { describe, expect, it } from "vitest"
import { toDraft, type PeriodLite } from "@/lib/omaImport/toDraft"
import type { ExtractedImport, ExtractedOma } from "@/lib/omaImport/schema"

const period2026H2: PeriodLite = {
  id: "h2-2026",
  startDate: new Date("2026-09-01"),
  endDate: new Date("2027-02-28"),
}
const period2027H1: PeriodLite = {
  id: "h1-2027",
  startDate: new Date("2027-01-01"),
  endDate: new Date("2027-06-30"),
}

const baseOma: ExtractedOma = {
  title: "Grow revenue",
  outcome: "Grow revenue this year",
  kpis: [
    {
      measure: "Revenue",
      unit: "CURRENCY",
      direction: "HIGHER_BETTER",
      target: 3_000_000,
      targetText: "R3 million",
    },
  ],
  actions: [
    { description: "Launch campaign", dueDate: "2027-01-01", completed: false, statusText: "In progress" },
  ],
}

function extracted(overrides: Partial<ExtractedImport> = {}): ExtractedImport {
  return {
    subjectName: "Sharine Potgieter",
    periodStart: "2026-09-01",
    periodEnd: "2027-02-28",
    omas: [baseOma],
    warnings: [],
    ...overrides,
  }
}

describe("toDraft", () => {
  it("picks the period with the largest date overlap", () => {
    const draft = toDraft(extracted(), [period2027H1, period2026H2], "test.pdf")
    expect(draft.periodId).toBe("h2-2026")
  })

  it("returns periodId null with a warning when no period overlaps", () => {
    const draft = toDraft(
      extracted({ periodStart: "2030-01-01", periodEnd: "2030-06-30" }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.periodId).toBeNull()
    expect(draft.warnings).toContain("No existing period overlaps the document's dates — pick one.")
  })

  it("returns periodId null with a warning when the document has no period dates", () => {
    const draft = toDraft(extracted({ periodStart: null, periodEnd: null }), [period2026H2], "test.pdf")
    expect(draft.periodId).toBeNull()
    expect(draft.warnings).toContain("Couldn't read the period dates from the PDF — pick one.")
  })

  it("defaults a null unit to NUMBER", () => {
    const draft = toDraft(
      extracted({ omas: [{ ...baseOma, kpis: [{ ...baseOma.kpis[0], unit: null }] }] }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.omas[0].metrics[0].unit).toBe("NUMBER")
  })

  it("defaults a null direction to HIGHER_BETTER", () => {
    const draft = toDraft(
      extracted({ omas: [{ ...baseOma, kpis: [{ ...baseOma.kpis[0], direction: null }] }] }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.omas[0].metrics[0].direction).toBe("HIGHER_BETTER")
  })

  it("defaults a null target to 0", () => {
    const draft = toDraft(
      extracted({ omas: [{ ...baseOma, kpis: [{ ...baseOma.kpis[0], target: null }] }] }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.omas[0].metrics[0].target).toBe(0)
  })

  it("keeps targetText and statusText for the review page", () => {
    const draft = toDraft(extracted(), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics[0].targetText).toBe("R3 million")
    expect(draft.omas[0].actions[0].statusText).toBe("In progress")
  })

  it("dedupes warnings while keeping order", () => {
    const draft = toDraft(extracted({ warnings: ["a", "b", "a"] }), [period2026H2], "test.pdf")
    expect(draft.warnings).toEqual(["a", "b"])
  })

  it("carries the filename through and passes subjectName through unchanged (including null)", () => {
    const draft = toDraft(extracted({ subjectName: null }), [period2026H2], "test.pdf")
    expect(draft.filename).toBe("test.pdf")
    expect(draft.subjectName).toBeNull()
  })

  it("maps every kpi and action 1:1 into metrics and actions", () => {
    const twoKpiOma: ExtractedOma = {
      ...baseOma,
      kpis: [
        baseOma.kpis[0],
        { measure: "Cost per report", unit: "CURRENCY", direction: "LOWER_BETTER", target: 3500, targetText: "R3 500" },
      ],
    }
    const draft = toDraft(extracted({ omas: [twoKpiOma] }), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics).toHaveLength(2)
    expect(draft.omas[0].metrics[1].measure).toBe("Cost per report")
  })

  it("does not warn when a KPI's target resolves to exactly 0 — a real, meaningful value", () => {
    const zeroTargetOma = {
      ...baseOma,
      kpis: [{ ...baseOma.kpis[0], measure: "Price", target: 0, targetText: "Price largely constant (0% increase)" }],
    }
    const draft = toDraft(extracted({ omas: [zeroTargetOma] }), [period2026H2], "test.pdf")
    expect(draft.warnings.some((w) => w.includes("Price"))).toBe(false)
  })
})
