import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import type { SessionUser } from "@/types"

export async function getSessionUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user) redirect("/login")
  // Reflect current DB state on every protected page/action rather than trusting
  // the 30-day JWT claims — deactivation and role/manager changes take effect at once.
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
