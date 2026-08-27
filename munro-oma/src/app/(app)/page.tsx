import { PageTitle } from "@/components/PageTitle"
import { RagBar } from "@/components/RagBar"
import { getCompanyDashboard } from "@/lib/queries"
import { resolvePeriodId } from "@/lib/periods"
import { db } from "@/lib/db"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string }
}) {
  const periodId = await resolvePeriodId(searchParams.period)
  const period = await db.period.findUniqueOrThrow({ where: { id: periodId } })
  const rows = await getCompanyDashboard(periodId)
  const qp = searchParams.period ? `?period=${periodId}` : ""

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <div className="flex items-baseline justify-between">
        <PageTitle>Main dashboard</PageTitle>
        <span className="text-xs font-semibold uppercase tracking-widest text-mfa-red">
          Q{period.quarter} · All departments
        </span>
      </div>
      <div className="mt-10">
        {rows.map((bu) => (
          <RagBar key={bu.id} label={bu.name} value={bu.pct} href={`/bu/${bu.id}${qp}`} />
        ))}
      </div>
      <p className="mt-12 text-sm text-mfa-muted">
        Bars show OMAs completed against OMAs set. Click a department to open its team.
      </p>
    </main>
  )
}
