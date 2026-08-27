import Link from "next/link"
import { getSessionUser } from "@/lib/session"
import { listPeriods, resolvePeriodId } from "@/lib/periods"
import { PeriodSelector } from "./PeriodSelector"
import { RoleBadge } from "./RoleBadge"

export async function AppHeader({ period }: { period?: string }) {
  const user = await getSessionUser()
  const periods = await listPeriods()
  const active = await resolvePeriodId(period)
  return (
    <header className="flex items-center justify-between border-b border-mfa-track px-8 py-4">
      <Link href="/" className="font-serif text-xl font-light text-mfa-red">
        Munro FA
      </Link>
      <div className="flex items-center gap-4">
        <PeriodSelector periods={periods} value={active} />
        <span className="font-semibold">{user.name}</span>
        <RoleBadge role={user.role} />
      </div>
    </header>
  )
}
