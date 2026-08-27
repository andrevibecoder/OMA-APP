import { beforeAll, describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { db } from "@/lib/db"
import { getBusinessUnit, getCompanyDashboard, getPerson } from "@/lib/queries"

let periodId: string
let sharineId: string
let marketingId: string

beforeAll(async () => {
  execSync("npm run db:seed", { stdio: "inherit" })
  const period = await db.period.findFirstOrThrow({ where: { isActive: true } })
  periodId = period.id
  const sharine = await db.user.findUniqueOrThrow({ where: { email: "sharine@munrofa.com" } })
  sharineId = sharine.id
  const mk = await db.businessUnit.findUniqueOrThrow({ where: { name: "Marketing" } })
  marketingId = mk.id
})

describe("getPerson", () => {
  it("returns Sharine's three OMAs at 100 / 45 / 0", async () => {
    const p = await getPerson(sharineId, periodId)
    expect(p?.omas.map((o) => o.pct)).toEqual([100, 45, 0])
  })
})

describe("getBusinessUnit", () => {
  it("lists Marketing people with Sharine ~48", async () => {
    const bu = await getBusinessUnit(marketingId, periodId)
    const sharine = bu?.people.find((x) => x.name === "Sharine")
    expect(sharine?.pct).toBe(48)
  })
})

describe("getCompanyDashboard", () => {
  it("returns BUs in order, all with OMAs", async () => {
    const rows = await getCompanyDashboard(periodId)
    expect(rows[0].name).toBe("Marketing")
    expect(rows.every((r) => typeof r.pct === "number")).toBe(true)
  })
})
