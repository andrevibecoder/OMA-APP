import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import type { SessionUser } from "@/types"

/** Defense-in-depth for the admin server actions. The page already redirects
 *  non-admins; this makes the mutations safe on their own too. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (user.role !== "ADMIN") throw new Error("Forbidden")
  return user
}

const LOGIN_LOG_LIMIT = 200

export async function getAdminData() {
  const [businessUnits, periodsRaw, users, loginEvents] = await Promise.all([
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
        endDate: true,
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
    db.loginEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: LOGIN_LOG_LIMIT,
      select: { id: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
  ])

  // Chronological — a new future period lands at the bottom.
  const periods = periodsRaw.sort(
    (a, b) =>
      a.startDate.getTime() - b.startDate.getTime() ||
      (a.endDate?.getTime() ?? 0) - (b.endDate?.getTime() ?? 0) ||
      a.label.localeCompare(b.label),
  )

  return { businessUnits, periods, users, loginEvents }
}

export type AdminData = Awaited<ReturnType<typeof getAdminData>>
