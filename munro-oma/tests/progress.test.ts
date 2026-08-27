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
} from "@/lib/progress"

const hi = (target: number, current: number) =>
  ({ direction: "HIGHER_BETTER", target, current }) as const
const lo = (target: number, current: number) =>
  ({ direction: "LOWER_BETTER", target, current }) as const

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
