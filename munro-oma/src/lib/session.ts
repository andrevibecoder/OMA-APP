import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import type { SessionUser } from "@/types"

export async function getSessionUser(): Promise<SessionUser> {
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
