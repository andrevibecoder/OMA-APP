import { describe, expect, it } from "vitest"
import {
  canComplete,
  finalScore,
  ratingLabel,
  ratingNumber,
  runningAverage,
} from "@/modules/review/scoring"

const r = (...vals: ("BELOW" | "MEETS" | "EXCEEDS" | null)[]) => vals.map((rating) => ({ rating }))

describe("ratingNumber / ratingLabel", () => {
  it("maps ratings to 1/2/3", () => {
    expect(ratingNumber("BELOW")).toBe(1)
    expect(ratingNumber("MEETS")).toBe(2)
    expect(ratingNumber("EXCEEDS")).toBe(3)
  })
  it("maps ratings to the expectation labels", () => {
    expect(ratingLabel("BELOW")).toBe("Below Expectation")
    expect(ratingLabel("MEETS")).toBe("Meets Expectation")
    expect(ratingLabel("EXCEEDS")).toBe("Exceeds Expectation")
  })
})

describe("finalScore", () => {
  it("is the mean of the rating numbers, 1 dp", () => {
    expect(finalScore(r("MEETS", "EXCEEDS", "MEETS"))).toBe(2.3)
  })
  it("is a whole number when it divides evenly", () => {
    expect(finalScore(r("MEETS", "MEETS"))).toBe(2)
  })
  it("is null when any item is unrated", () => {
    expect(finalScore(r("MEETS", null))).toBeNull()
  })
  it("is null for an empty list", () => {
    expect(finalScore([])).toBeNull()
  })
})

describe("runningAverage", () => {
  it("averages only the rated items", () => {
    expect(runningAverage(r("EXCEEDS", "MEETS", null))).toBe(2.5)
  })
  it("is null when nothing is rated", () => {
    expect(runningAverage(r(null, null))).toBeNull()
  })
})

describe("canComplete", () => {
  it("is true only when every item is rated", () => {
    expect(canComplete(r("MEETS", "BELOW"))).toBe(true)
  })
  it("is false when an item is unrated", () => {
    expect(canComplete(r("MEETS", null))).toBe(false)
  })
  it("is false for an empty list", () => {
    expect(canComplete([])).toBe(false)
  })
})
