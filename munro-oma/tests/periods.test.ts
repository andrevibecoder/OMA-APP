import { describe, expect, it } from "vitest"
import { periodRangeLabel } from "@/lib/periods"

describe("periodRangeLabel", () => {
  it("spells out the year, term and date range", () => {
    expect(
      periodRangeLabel({
        year: 2026,
        shortLabel: "H2",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-02-28"),
      }),
    ).toBe("2026 H2 (1 Sep 26 - 28 Feb 27)")
  })

  it("falls back to the start date when there's no end date", () => {
    expect(
      periodRangeLabel({
        year: 2027,
        shortLabel: "FY",
        startDate: new Date("2027-01-01"),
        endDate: null,
      }),
    ).toBe("2027 FY (1 Jan 27 - 1 Jan 27)")
  })
})
