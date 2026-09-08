import { describe, expect, it } from "vitest"
import { withDbRetry } from "@/lib/dbRetry"

const err = (code: string, message = code) => Object.assign(new Error(message), { code })

describe("withDbRetry", () => {
  it("returns the result when the operation succeeds first time", async () => {
    expect(await withDbRetry(async () => 42)).toBe(42)
  })

  it("retries a pool-acquisition timeout (P2024), then succeeds", async () => {
    let calls = 0
    const op = async () => {
      calls++
      if (calls < 3) throw err("P2024", "pool timeout")
      return "ok"
    }
    expect(await withDbRetry(op, { tries: 3, delayMs: 0 })).toBe("ok")
    expect(calls).toBe(3)
  })

  it("retries when the database is briefly unreachable (P1001)", async () => {
    let calls = 0
    const op = async () => {
      calls++
      if (calls < 2) throw err("P1001", "can't reach database")
      return "recovered"
    }
    expect(await withDbRetry(op, { tries: 3, delayMs: 0 })).toBe("recovered")
  })

  it("gives up after the retry budget and rethrows the last error", async () => {
    const op = async () => {
      throw err("P2024", "still busy")
    }
    await expect(withDbRetry(op, { tries: 2, delayMs: 0 })).rejects.toThrow("still busy")
  })

  it("does not retry an error that isn't connection acquisition (e.g. a unique-constraint clash)", async () => {
    let calls = 0
    const op = async () => {
      calls++
      throw err("P2002", "unique constraint failed")
    }
    await expect(withDbRetry(op, { tries: 3, delayMs: 0 })).rejects.toThrow("unique constraint failed")
    expect(calls).toBe(1)
  })

  it("does not retry a plain error with no code", async () => {
    let calls = 0
    const op = async () => {
      calls++
      throw new Error("Not allowed")
    }
    await expect(withDbRetry(op, { tries: 3, delayMs: 0 })).rejects.toThrow("Not allowed")
    expect(calls).toBe(1)
  })
})
