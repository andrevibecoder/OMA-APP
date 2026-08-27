import { db } from "@/lib/db"

// QUARTER before HALF before ANNUAL when start dates tie (Q1/H1/FY all start Jan 1)
const KIND_ORDER = { QUARTER: 0, HALF: 1, ANNUAL: 2 } as const

export async function getActivePeriod() {
  const active = await db.period.findFirst({ where: { isActive: true } })
  if (active) return active
  const latest = await db.period.findFirst({ orderBy: { startDate: "desc" } })
  if (!latest) throw new Error("No periods exist — run the seed.")
  return latest
}

export async function listPeriods() {
  const periods = await db.period.findMany({
    select: { id: true, label: true, kind: true, startDate: true },
  })
  return periods
    .sort(
      (a, b) =>
        a.startDate.getTime() - b.startDate.getTime() ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
    )
    .map((p) => ({ id: p.id, label: p.label }))
}

export async function resolvePeriodId(searchParam: string | undefined): Promise<string> {
  if (searchParam) {
    const hit = await db.period.findUnique({ where: { id: searchParam }, select: { id: true } })
    if (hit) return hit.id
  }
  return (await getActivePeriod()).id
}
