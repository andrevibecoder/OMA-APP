import { describe, expect, it } from "vitest"
import { parseAmount } from "@/lib/progress"

describe("parseAmount", () => {
  it("plain numbers pass through", () => {
    expect(parseAmount("3")).toBe(3)
    expect(parseAmount("3.5")).toBe(3.5)
    expect(parseAmount("0")).toBe(0)
  })

  it("strips currency symbols, commas and spaces", () => {
    expect(parseAmount("R3,000,000")).toBe(3_000_000)
    expect(parseAmount("$1 500")).toBe(1500)
    expect(parseAmount("3 000 000.00")).toBe(3_000_000)
  })

  it("reads k / m / b suffixes", () => {
    expect(parseAmount("3k")).toBe(3_000)
    expect(parseAmount("1.5k")).toBe(1_500)
    expect(parseAmount("3m")).toBe(3_000_000)
    expect(parseAmount("3M")).toBe(3_000_000)
    expect(parseAmount("1.2b")).toBe(1_200_000_000)
  })

  it("reads the word forms 'mill' / 'million' / 'bn'", () => {
    expect(parseAmount("3 mill")).toBe(3_000_000)
    expect(parseAmount("3 Million")).toBe(3_000_000)
    expect(parseAmount("3mil")).toBe(3_000_000)
    expect(parseAmount("2bn")).toBe(2_000_000_000)
    expect(parseAmount("R3 mill")).toBe(3_000_000)
  })

  it("returns null when there's no number", () => {
    expect(parseAmount("")).toBeNull()
    expect(parseAmount("   ")).toBeNull()
    expect(parseAmount("abc")).toBeNull()
    expect(parseAmount("mill")).toBeNull()
    expect(parseAmount("3 apples")).toBeNull()
  })
})
