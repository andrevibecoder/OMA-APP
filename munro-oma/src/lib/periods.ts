import { db } from "@/lib/db"

// Group the dropdown by granularity: all quarters, then halves, then full year.
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
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.startDate.getTime() - b.startDate.getTime(),
    )
    .map((p) => ({ id: p.id, label: p.label }))
}

export type PeriodLite = { id: string; startDate: Date; endDate: Date | null }

// Full date range per period — unlike listPeriods (which strips dates after
// sorting), this is for period-overlap matching (OMA PDF import, D7).
export async function getPeriodsWithDates(): Promise<PeriodLite[]> {
  return db.period.findMany({ select: { id: true, startDate: true, endDate: true } })
}

export async function resolvePeriodId(searchParam: string | undefined): Promise<string> {
  if (searchParam) {
    const hit = await db.period.findUnique({ where: { id: searchParam }, select: { id: true } })
    if (hit) return hit.id
  }
  return (await getActivePeriod()).id
}

// Fixed abbreviations, not toLocaleDateString — the en-GB Intl short month
// for September renders as "Sept" (four letters, unlike every other month),
// which reads oddly next to the rest. UTC getters because these dates are
// stored as UTC midnight and a negative-offset server timezone could
// otherwise roll the day back by one.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function shortDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`
}

// "H2" alone (shortLabel) reads as a bare term with no sense of which year or
// exact window it covers — this spells both out, e.g.
// "2026 H2 (1 Sep 26 - 28 Feb 27)".
export function periodRangeLabel(period: {
  year: number
  shortLabel: string
  startDate: Date
  endDate: Date | null
}): string {
  const end = period.endDate ?? period.startDate
  return `${period.year} ${period.shortLabel} (${shortDate(period.startDate)} - ${shortDate(end)})`
}
