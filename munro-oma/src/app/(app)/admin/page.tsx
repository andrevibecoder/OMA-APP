import { redirect } from "next/navigation"
import { PageTitle } from "@/components/PageTitle"
import { AdminConsole } from "@/components/AdminConsole"
import { getSessionUser } from "@/lib/session"
import { getAdminData } from "@/lib/admin"

export default async function AdminPage() {
  const viewer = await getSessionUser()
  if (viewer.role !== "ADMIN") redirect("/")
  const data = await getAdminData()

  return (
    <main>
      <PageTitle>Admin</PageTitle>
      <p className="mt-2 text-sm text-mfa-muted">
        Business units, review periods and people. Text edits save when you press
        the row&apos;s <span className="font-semibold">Save</span>; toggles, reorder
        and the active period save straight away.
      </p>
      <div className="mt-8">
        <AdminConsole data={data} viewerId={viewer.id} />
      </div>
    </main>
  )
}
