import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import type { SessionUser } from "@/types"

const KIND_ORDER = { QUARTER: 0, HALF: 1, ANNUAL: 2 } as const

/** Defense-in-depth for the admin server actions. The page already redirects
 *  non-admins; this makes the mutations safe on their own too. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (user.role !== "ADMIN") throw new Error("Forbidden")
  return user
}

export async function getAdminData() {
  const [businessUnits, periodsRaw, users] = await Promise.all([
    db.businessUnit.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true, _count: { select: { users: true } } },
    }),
    db.period.findMany({
      select: {
        id: true,
        label: true,
        shortLabel: true,
        kind: true,
        year: true,
        startDate: true,
        isActive: true,
        locked: true,
        _count: { select: { omas: true } },
      },
    }),
    db.user.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        businessUnitId: true,
        managerId: true,
        businessUnit: { select: { name: true } },
        manager: { select: { name: true } },
        _count: { select: { omas: true, team: true } },
      },
    }),
  ])

  const periods = periodsRaw.sort(
    (a, b) =>
      b.year - a.year ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.startDate.getTime() - b.startDate.getTime(),
  )

  return { businessUnits, periods, users }
}

export type AdminData = Awaited<ReturnType<typeof getAdminData>>
