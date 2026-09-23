import { describe, expect, it } from "vitest"
import {
  ragState,
  ragColorVar,
  formatMetricValue,
  metricAttainment,
  metricBarPercent,
  omaProgress,
  mean,
  personProgress,
  buProgress,
  hasOmasWithNoTargets,
  hasNoRecordedProgress,
  zeroBarReason,
  dateSerial,
} from "@/lib/progress"

const hi = (target: number, current: number) =>
  ({ unit: "NUMBER", direction: "HIGHER_BETTER", target, current }) as const
const lo = (target: number, current: number) =>
  ({ unit: "NUMBER", direction: "LOWER_BETTER", target, current }) as const
const date = (target: number, current: number) =>
  ({ unit: "DATE", direction: "HIGHER_BETTER", target, current }) as const

describe("ragState", () => {
  it("maps thresholds exactly", () => {
    expect(ragState(0)).toBe("not-started")
    expect(ragState(1)).toBe("behind")
    expect(ragState(49)).toBe("behind")
    expect(ragState(50)).toBe("in-progress")
    expect(ragState(79)).toBe("in-progress")
    expect(ragState(80)).toBe("on-track")
    expect(ragState(100)).toBe("on-track")
  })
})

describe("ragColorVar", () => {
  it("maps not-started to transparent", () => {
    expect(ragColorVar("not-started")).toBe("transparent")
  })
  it("maps behind to var(--rag-red)", () => {
    expect(ragColorVar("behind")).toBe("var(--rag-red)")
  })
  it("maps in-progress to var(--rag-amber)", () => {
    expect(ragColorVar("in-progress")).toBe("var(--rag-amber)")
  })
  it("maps on-track to var(--rag-green)", () => {
    expect(ragColorVar("on-track")).toBe("var(--rag-green)")
  })
})

describe("formatMetricValue", () => {
  it("NUMBER: space thousands over 999, rounded", () => {
    expect(formatMetricValue(40, "NUMBER")).toBe("40")
    expect(formatMetricValue(3000, "NUMBER")).toBe("3 000")
    expect(formatMetricValue(37.6, "NUMBER")).toBe("38")
  })
  it("CURRENCY: R prefix, space thousands, no decimals", () => {
    expect(formatMetricValue(3000000, "CURRENCY")).toBe("R3 000 000")
    expect(formatMetricValue(950.4, "CURRENCY")).toBe("R950")
  })
  it("PERCENT: value + %, decimals kept", () => {
    expect(formatMetricValue(95, "PERCENT")).toBe("95%")
    expect(formatMetricValue(95.5, "PERCENT")).toBe("95.5%")
  })
  it("DAYS: value + ' days'", () => {
    expect(formatMetricValue(10, "DAYS")).toBe("10 days")
  })
  it("DATE: reads back the serial as a readable date", () => {
    expect(formatMetricValue(dateSerial("2026-09-30"), "DATE")).toBe("30 Sep 2026")
  })
  it("DATE: 0 (unset) reads as a dash, not the 1970 epoch", () => {
    expect(formatMetricValue(0, "DATE")).toBe("—")
  })
})

describe("dateSerial", () => {
  it("round-trips through formatMetricValue using UTC, immune to server timezone", () => {
    expect(formatMetricValue(dateSerial("2027-02-28"), "DATE")).toBe("28 Feb 2027")
    expect(formatMetricValue(dateSerial("2026-01-01"), "DATE")).toBe("1 Jan 2026")
  })
})

describe("metricAttainment", () => {
  it("higher is better: current / target", () => {
    expect(metricAttainment(hi(40, 10))).toBe(25)
    expect(metricAttainment(hi(40, 40))).toBe(100)
    expect(metricAttainment(hi(40, 60))).toBe(150) // can exceed 100
  })
  it("lower is better: target / current", () => {
    expect(metricAttainment(lo(10, 20))).toBe(50)
    expect(metricAttainment(lo(10, 10))).toBe(100)
    expect(metricAttainment(lo(10, 5))).toBe(200) // beat it
  })
  it("degenerate: higher-better with target 0 -> 0", () => {
    expect(metricAttainment(hi(0, 5))).toBe(0)
  })
  it("degenerate: lower-better with current 0 -> 100 when target is real", () => {
    expect(metricAttainment(lo(10, 0))).toBe(100)
    expect(metricAttainment(lo(0, 0))).toBe(0)
  })
  it("clamps negatives to 0", () => {
    expect(metricAttainment(hi(40, -5))).toBe(0)
  })
  it("DATE: a deadline is 0% until marked done (current set), then 100% — direction is irrelevant", () => {
    const target = dateSerial("2026-09-30")
    expect(metricAttainment(date(target, 0))).toBe(0)
    expect(metricAttainment(date(target, dateSerial("2026-09-28")))).toBe(100) // done early
    expect(metricAttainment(date(target, dateSerial("2026-10-05")))).toBe(100) // done late — still "done"
    expect(metricAttainment(date(0, 0))).toBe(0) // no deadline set at all
  })
})

describe("metricBarPercent", () => {
  it("caps at 100", () => {
    expect(metricBarPercent(hi(40, 60))).toBe(100)
    expect(metricBarPercent(hi(40, 10))).toBe(25)
  })
})

describe("omaProgress", () => {
  it("is 0 when there are no metrics", () => {
    expect(omaProgress({ metrics: [] })).toBe(0)
  })
  it("is the mean of the capped metric percentages", () => {
    expect(omaProgress({ metrics: [hi(40, 10)] })).toBe(25)
    expect(omaProgress({ metrics: [hi(40, 10), hi(100, 100)] })).toBe(63) // mean(25, 100)
    expect(omaProgress({ metrics: [hi(40, 80), hi(40, 40)] })).toBe(100) // both cap to 100
  })
})

describe("mean", () => {
  it("is 0 for empty", () => expect(mean([])).toBe(0))
  it("rounds", () => expect(mean([100, 45, 0])).toBe(48))
  it("rounds half cases", () => expect(mean([0, 1])).toBe(1))
})

describe("personProgress", () => {
  it("averages OMA progress", () => {
    expect(
      personProgress([
        { metrics: [hi(40, 40)] }, // 100
        { metrics: [hi(40, 20)] }, // 50
        { metrics: [] }, // 0
      ]),
    ).toBe(50)
  })
})

describe("buProgress", () => {
  it("skips people with no OMAs", () => {
    const withOmas = { omas: [{ metrics: [hi(40, 40)] }] } // 100
    const noOmas = { omas: [] }
    expect(buProgress([withOmas, noOmas])).toBe(100)
  })
  it("is 0 when nobody has OMAs", () => {
    expect(buProgress([{ omas: [] }, { omas: [] }])).toBe(0)
  })
})

describe("hasOmasWithNoTargets", () => {
  it("is false when there are no OMAs at all — that's a different empty state", () => {
    expect(hasOmasWithNoTargets([])).toBe(false)
  })

  it("is true for an OMA with metrics but no target set on any of them", () => {
    expect(hasOmasWithNoTargets([{ metrics: [hi(0, 0)] }])).toBe(true)
  })

  it("is true for an OMA with no metrics at all", () => {
    expect(hasOmasWithNoTargets([{ metrics: [] }])).toBe(true)
  })

  it("is true as soon as one OMA in the group has no usable target, even if another does", () => {
    expect(
      hasOmasWithNoTargets([{ metrics: [hi(0, 0)] }, { metrics: [hi(40, 0)] }]),
    ).toBe(true)
  })

  it("is false when every OMA has a real target, even if current attainment is genuinely 0", () => {
    expect(hasOmasWithNoTargets([{ metrics: [hi(40, 0)] }])).toBe(false)
  })

  it("is false for an OMA with several metrics as long as one of them has a real target", () => {
    expect(hasOmasWithNoTargets([{ metrics: [hi(40, 10), hi(0, 0)] }])).toBe(false)
  })
})

describe("hasNoRecordedProgress", () => {
  it("is false when there are no OMAs at all", () => {
    expect(hasNoRecordedProgress([])).toBe(false)
  })

  it("is true when every metric's current is still 0", () => {
    expect(hasNoRecordedProgress([{ metrics: [hi(40, 0)] }, { metrics: [hi(10, 0)] }])).toBe(true)
  })

  it("is false as soon as one metric anywhere has a recorded current", () => {
    expect(hasNoRecordedProgress([{ metrics: [hi(40, 0)] }, { metrics: [hi(10, 5)] }])).toBe(false)
  })
})

describe("zeroBarReason", () => {
  it("is the catch-all when there are no OMAs at all", () => {
    expect(zeroBarReason([])).toBe("Targets or progress not complete.")
  })

  it("is the catch-all when a target is missing", () => {
    expect(zeroBarReason([{ metrics: [hi(0, 0)] }])).toBe("Targets or progress not complete.")
  })

  it("is the catch-all when real targets exist but nothing's been recorded", () => {
    expect(zeroBarReason([{ metrics: [hi(40, 0)] }])).toBe("Targets or progress not complete.")
  })

  it("is null once there's a real target and a real recorded current, even if attainment rounds to 0%", () => {
    // current is nonzero (something has been reported), it's just tiny
    // relative to the target — a genuine, meaningful ~0%, not a data-entry gap.
    expect(zeroBarReason([{ metrics: [hi(1_000_000, 1)] }])).toBeNull()
  })
})
