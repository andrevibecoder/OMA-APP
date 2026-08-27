import { redirect } from "next/navigation"
import { auth } from "@/auth"
import type { SessionUser } from "@/types"

export async function getSessionUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const u = session.user
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    businessUnitId: u.businessUnitId,
    managerId: u.managerId,
  }
}
