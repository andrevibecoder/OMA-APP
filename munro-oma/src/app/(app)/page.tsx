import { PageTitle } from "@/components/PageTitle"
import { RagBar } from "@/components/RagBar"
import { getCompanyDashboard } from "@/lib/queries"
import { mean } from "@/lib/progress"
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
  const totalAverage = mean(rows.map((bu) => bu.pct))
  const qp = searchParams.period ? `?period=${periodId}` : ""

  return (
    <main>
      <div className="flex items-baseline justify-between">
        <PageTitle>Main dashboard</PageTitle>
        <span className="text-xs font-semibold uppercase tracking-widest text-mfa-red">
          {period.shortLabel} · All departments
        </span>
      </div>
      <div className="mt-10 border-b border-mfa-track pb-3">
        {/* Not a department — always the rolled-up average of the rows below, so it's not a link. */}
        <RagBar label="Total Average" value={totalAverage} />
      </div>
      <div className="mt-3">
        {rows.map((bu) => (
          <RagBar key={bu.id} label={bu.name} value={bu.pct} href={`/bu/${bu.id}${qp}`} />
        ))}
      </div>
    </main>
  )
}
