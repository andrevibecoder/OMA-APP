import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import type { SessionUser } from "@/types"

// Dev-only: set AUTH_DEV_BYPASS to a seeded user's email in .env to skip login
// entirely while working locally. Ignored unless NODE_ENV is "development".
const devBypassEmail =
  process.env.NODE_ENV === "development" ? process.env.AUTH_DEV_BYPASS : undefined

export async function getSessionUser(): Promise<SessionUser> {
  if (devBypassEmail) {
    const u = await db.user.findUnique({
      where: { email: devBypassEmail },
      select: { id: true, name: true, active: true, role: true, businessUnitId: true, managerId: true },
    })
    if (u && u.active) {
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        businessUnitId: u.businessUnitId,
        managerId: u.managerId,
      }
    }
  }

  const session = await auth()
  if (!session?.user) redirect("/login")
  // Reflect current DB state on every protected page/action rather than trusting
  // the JWT claims — deactivation and role/manager changes take effect at once.
  // A missing row (e.g. after a reseed) or an inactive user is sent to /login,
  // which always renders (see auth.config.ts) so this can't loop.
  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, active: true, role: true, businessUnitId: true, managerId: true },
  })
  if (!dbUser || !dbUser.active) redirect("/login")
  return {
    id: session.user.id,
    name: dbUser.name,
    role: dbUser.role,
    businessUnitId: dbUser.businessUnitId,
    managerId: dbUser.managerId,
  }
}
