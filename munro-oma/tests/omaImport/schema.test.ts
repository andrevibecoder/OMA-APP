import { describe, expect, it } from "vitest"
import { extractedImportSchema } from "@/lib/omaImport/schema"

const validKpi = {
  measure: "Revenue",
  unit: "CURRENCY",
  direction: "HIGHER_BETTER",
  target: 3_000_000,
  targetText: "R3 million",
  note: null,
}

const validOma = {
  title: "Grow revenue",
  outcome: "Grow revenue this year",
  kpis: [validKpi],
  actions: [
    { description: "Launch campaign", dueDate: "2027-01-01", completed: false, statusText: "In progress" },
  ],
}

const validImport = {
  subjectName: "Sharine Potgieter",
  periodStart: "2026-09-01",
  periodEnd: "2027-02-28",
  omas: [validOma],
  warnings: [],
}

describe("extractedImportSchema", () => {
  it("accepts a fully-populated valid shape", () => {
    expect(extractedImportSchema.safeParse(validImport).success).toBe(true)
  })

  it("accepts null for subjectName, periodStart, periodEnd", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        subjectName: null,
        periodStart: null,
        periodEnd: null,
      }).success,
    ).toBe(true)
  })

  it("accepts null unit, direction and target on a KPI", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        omas: [{ ...validOma, kpis: [{ ...validKpi, unit: null, direction: null, target: null }] }],
      }).success,
    ).toBe(true)
  })

  it("accepts a non-null note on a KPI", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        omas: [{ ...validOma, kpis: [{ ...validKpi, note: "Range collapsed to its lower bound." }] }],
      }).success,
    ).toBe(true)
  })

  it("rejects a missing note field on a KPI", () => {
    const { note: _note, ...kpiWithoutNote } = validKpi
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        omas: [{ ...validOma, kpis: [kpiWithoutNote] }],
      }).success,
    ).toBe(false)
  })

  it("rejects a missing omas field", () => {
    const { omas: _omas, ...withoutOmas } = validImport
    expect(extractedImportSchema.safeParse(withoutOmas).success).toBe(false)
  })

  it("rejects a target given as a string instead of a number", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        omas: [{ ...validOma, kpis: [{ ...validKpi, target: "3000000" }] }],
      }).success,
    ).toBe(false)
  })

  it("rejects an unrecognised unit value", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        omas: [{ ...validOma, kpis: [{ ...validKpi, unit: "WEIGHT" }] }],
      }).success,
    ).toBe(false)
  })
})
