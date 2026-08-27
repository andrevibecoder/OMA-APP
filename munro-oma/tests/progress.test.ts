import { describe, expect, it } from "vitest"
import { ragState, ragColorVar, omaProgress, mean, personProgress, buProgress } from "@/lib/progress"

const done = { completed: true }
const todo = { completed: false }

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

describe("omaProgress", () => {
  it("is 0 when there are no actions", () => {
    expect(omaProgress({ actions: [] })).toBe(0)
  })
  it("rounds completed/total", () => {
    expect(omaProgress({ actions: [done, todo, todo] })).toBe(33)
    expect(omaProgress({ actions: [done, done, done] })).toBe(100)
    expect(omaProgress({ actions: [done, todo] })).toBe(50)
  })
})

describe("mean", () => {
  it("is 0 for empty", () => expect(mean([])).toBe(0))
  it("rounds", () => expect(mean([100, 45, 0])).toBe(48))
  it("rounds half cases", () => expect(mean([0, 1])).toBe(1))
})

describe("personProgress", () => {
  it("averages OMA progress", () => {
    expect(personProgress([{ actions: [done] }, { actions: [todo] }, { actions: [] }])).toBe(33)
  })
})

describe("buProgress", () => {
  it("skips people with no OMAs", () => {
    const withOmas = { omas: [{ actions: [done] }] } // 100
    const noOmas = { omas: [] }
    expect(buProgress([withOmas, noOmas])).toBe(100)
  })
  it("is 0 when nobody has OMAs", () => {
    expect(buProgress([{ omas: [] }, { omas: [] }])).toBe(0)
  })
})
