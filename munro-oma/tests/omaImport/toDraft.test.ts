import { describe, expect, it } from "vitest"
import { toDraft, type PeriodLite } from "@/lib/omaImport/toDraft"
import type { ExtractedImport, ExtractedOma } from "@/lib/omaImport/schema"
import { dateSerial } from "@/lib/progress"

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
      targetDate: null,
      targetText: "R3 million",
      note: null,
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
        { measure: "Cost per report", unit: "CURRENCY", direction: "LOWER_BETTER", target: 3500, targetDate: null, targetText: "R3 500", note: null },
      ],
    }
    const draft = toDraft(extracted({ omas: [twoKpiOma] }), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics).toHaveLength(2)
    expect(draft.omas[0].metrics[1].measure).toBe("Cost per report")
  })

  it("carries a KPI's note through unchanged, and defaults a null note to null", () => {
    const draft = toDraft(
      extracted({
        omas: [{ ...baseOma, kpis: [{ ...baseOma.kpis[0], note: "Range collapsed to its lower bound." }] }],
      }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.omas[0].metrics[0].note).toBe("Range collapsed to its lower bound.")
    expect(toDraft(extracted(), [period2026H2], "test.pdf").omas[0].metrics[0].note).toBeNull()
  })

  it("does not warn when a KPI's target resolves to exactly 0 — a real, meaningful value", () => {
    const zeroTargetOma = {
      ...baseOma,
      kpis: [{ ...baseOma.kpis[0], measure: "Price", target: 0, targetText: "Price largely constant (0% increase)" }],
    }
    const draft = toDraft(extracted({ omas: [zeroTargetOma] }), [period2026H2], "test.pdf")
    expect(draft.warnings.some((w) => w.includes("Price"))).toBe(false)
  })

  it("downgrades a PERCENT score out of 10 to NUMBER and explains the correction", () => {
    const scoreOma = {
      ...baseOma,
      kpis: [
        {
          measure: "Team Wellbeing Score (self-reported, out of 10)",
          unit: "PERCENT" as const,
          direction: "HIGHER_BETTER" as const,
          target: 7,
          targetDate: null,
          targetText: "≥ 7 / 10 (TBC — set the floor with the team)",
          note: null,
        },
      ],
    }
    const draft = toDraft(extracted({ omas: [scoreOma] }), [period2026H2], "test.pdf")
    const metric = draft.omas[0].metrics[0]
    expect(metric.unit).toBe("NUMBER")
    expect(metric.note).toContain("Unit changed from Percent to Number")
    expect(metric.note).toContain("out of 10")
  })

  it("appends the unit correction to an existing note rather than replacing it", () => {
    const scoreOma = {
      ...baseOma,
      kpis: [
        {
          measure: "Wellbeing score",
          unit: "PERCENT" as const,
          direction: "HIGHER_BETTER" as const,
          target: 7,
          targetDate: null,
          targetText: "7/10",
          note: "Target marked TBC in the source.",
        },
      ],
    }
    const draft = toDraft(extracted({ omas: [scoreOma] }), [period2026H2], "test.pdf")
    const note = draft.omas[0].metrics[0].note
    expect(note).toContain("Target marked TBC in the source.")
    expect(note).toContain("Unit changed from Percent to Number")
  })

  it("leaves a genuine percentage (out of 100) classified as PERCENT", () => {
    const percentOma = {
      ...baseOma,
      kpis: [
        {
          measure: "Score out of 100",
          unit: "PERCENT" as const,
          direction: "HIGHER_BETTER" as const,
          target: 90,
          targetDate: null,
          targetText: "90/100",
          note: null,
        },
      ],
    }
    const draft = toDraft(extracted({ omas: [percentOma] }), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics[0].unit).toBe("PERCENT")
    expect(draft.omas[0].metrics[0].note).toBeNull()
  })

  it("converts a DATE KPI's targetDate into the epoch-millis target, ignoring the null numeric target", () => {
    const deadlineOma = {
      ...baseOma,
      kpis: [
        {
          measure: "Jethro design and resourcing recommendation delivered for review",
          unit: "DATE" as const,
          direction: "HIGHER_BETTER" as const,
          target: null,
          targetDate: "2026-09-30",
          targetText: "Signed off in the week 30 September 2026, ready to feed the October planning & budget round",
          note: null,
        },
      ],
    }
    const draft = toDraft(extracted({ omas: [deadlineOma] }), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics[0].unit).toBe("DATE")
    expect(draft.omas[0].metrics[0].target).toBe(dateSerial("2026-09-30"))
  })

  it("defaults a DATE KPI with no targetDate to target 0 (unset), not NaN", () => {
    const deadlineOma = {
      ...baseOma,
      kpis: [
        {
          measure: "Some deliverable",
          unit: "DATE" as const,
          direction: "HIGHER_BETTER" as const,
          target: null,
          targetDate: null,
          targetText: "[TBC]",
          note: null,
        },
      ],
    }
    const draft = toDraft(extracted({ omas: [deadlineOma] }), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics[0].target).toBe(0)
  })

  it("leaves a plain % figure with no unit already classified as PERCENT", () => {
    const percentOma = {
      ...baseOma,
      kpis: [
        {
          measure: "% of Reports Delivered on Time",
          unit: "PERCENT" as const,
          direction: "HIGHER_BETTER" as const,
          target: 90,
          targetDate: null,
          targetText: "focus 90–95%",
          note: null,
        },
      ],
    }
    const draft = toDraft(extracted({ omas: [percentOma] }), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics[0].unit).toBe("PERCENT")
  })
})
