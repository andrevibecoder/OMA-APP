import Link from "next/link"
import { getSessionUser } from "@/lib/session"
import { listPeriods, resolvePeriodId } from "@/lib/periods"
import { PeriodSelector } from "./PeriodSelector"

export async function AppHeader({ period }: { period?: string }) {
  const user = await getSessionUser()
  const periods = await listPeriods()
  const active = await resolvePeriodId(period)
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-mfa-black px-6 py-4 text-mfa-white sm:px-8">
      <Link href="/" className="text-xl font-bold uppercase tracking-wide text-mfa-red">
        OMA Performance Systems
      </Link>
      <div className="flex items-center gap-4">
        {user.role === "ADMIN" && (
          <Link href="/admin" className="text-sm font-semibold text-mfa-white/80 hover:text-mfa-white">
            Admin
          </Link>
        )}
        <PeriodSelector periods={periods} value={active} />
        <span className="font-semibold">{user.name}</span>
      </div>
    </header>
  )
}
