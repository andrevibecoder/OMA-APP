import { describe, expect, it } from "vitest"
import { subjectsToOpen } from "@/modules/review/openSelection"

describe("subjectsToOpen", () => {
  it("returns eligible subjects that have no review yet, in order", () => {
    expect(subjectsToOpen(["a", "b", "c"], ["b"])).toEqual(["a", "c"])
  })
  it("returns nothing when everyone already has a review", () => {
    expect(subjectsToOpen(["a", "b"], ["a", "b", "x"])).toEqual([])
  })
  it("de-duplicates the eligible list", () => {
    expect(subjectsToOpen(["a", "a", "b"], [])).toEqual(["a", "b"])
  })
  it("is empty when there are no eligible subjects", () => {
    expect(subjectsToOpen([], ["a"])).toEqual([])
  })
})
