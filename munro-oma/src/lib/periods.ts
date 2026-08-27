import { db } from "@/lib/db"

export async function getActivePeriod() {
  const active = await db.period.findFirst({ where: { isActive: true } })
  if (active) return active
  const latest = await db.period.findFirst({ orderBy: [{ year: "desc" }, { quarter: "desc" }] })
  if (!latest) throw new Error("No periods exist — run the seed.")
  return latest
}

export async function listPeriods() {
  return db.period.findMany({
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
    select: { id: true, label: true },
  })
}

export async function resolvePeriodId(searchParam: string | undefined): Promise<string> {
  if (searchParam) {
    const hit = await db.period.findUnique({ where: { id: searchParam }, select: { id: true } })
    if (hit) return hit.id
  }
  return (await getActivePeriod()).id
}
