import Link from "next/link"
import { PageTitle } from "@/components/PageTitle"
import { RagBar } from "@/components/RagBar"
import { getCompanyDashboard, getPeopleDashboard } from "@/lib/queries"
import { mean } from "@/lib/progress"
import { resolvePeriodId } from "@/lib/periods"
import { db } from "@/lib/db"

type View = "functional" | "people"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string; view?: string }
}) {
  const periodId = await resolvePeriodId(searchParams.period)
  const period = await db.period.findUniqueOrThrow({ where: { id: periodId } })
  const view: View = searchParams.view === "people" ? "people" : "functional"
  const pqp = searchParams.period ? `period=${periodId}` : "" // period, as a bare query fragment

  function tabHref(v: View) {
    const parts = [pqp, v === "people" ? "view=people" : ""].filter(Boolean)
    return parts.length ? `/?${parts.join("&")}` : "/"
  }

  return (
    <main>
      <div className="flex flex-wrap items-baseline justify-between gap-y-2">
        <PageTitle>Main dashboard</PageTitle>
        <span className="text-xs font-semibold uppercase tracking-widest text-mfa-red">
          {period.shortLabel} · All departments
        </span>
      </div>

      <div className="mt-4 inline-flex overflow-hidden rounded-md border border-mfa-track text-sm font-semibold">
        {(["functional", "people"] as const).map((v) => (
          <Link
            key={v}
            href={tabHref(v)}
            className={`px-4 py-1.5 ${
              view === v ? "bg-mfa-red text-white" : "text-mfa-muted hover:text-mfa-ink"
            }`}
          >
            {v === "functional" ? "Function" : "People"}
          </Link>
        ))}
      </div>

      {view === "functional" ? (
        <FunctionalView periodId={periodId} qp={pqp ? `?${pqp}` : ""} />
      ) : (
        <PeopleView periodId={periodId} qp={pqp ? `?${pqp}` : ""} />
      )}
    </main>
  )
}

async function FunctionalView({ periodId, qp }: { periodId: string; qp: string }) {
  const rows = await getCompanyDashboard(periodId)
  const totalAverage = mean(rows.map((bu) => bu.pct))

  return (
    <>
      <div className="mt-8 border-b border-mfa-track pb-3">
        {/* Not a department — always the rolled-up average of the rows below, so it's not a link. */}
        <RagBar label="Total Average" value={totalAverage} />
      </div>
      <div className="mt-3">
        {rows.map((bu) => (
          <RagBar key={bu.id} label={bu.name} value={bu.pct} href={`/bu/${bu.id}${qp}`} />
        ))}
      </div>
    </>
  )
}

async function PeopleView({ periodId, qp }: { periodId: string; qp: string }) {
  const departments = await getPeopleDashboard(periodId)

  return (
    <div className="mt-8 space-y-8">
      {departments.map((bu) => (
        <section key={bu.id}>
          <div className="rounded-xl bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">
            {bu.name}
          </div>
          <div className="mt-3">
            {bu.people.length > 0 ? (
              bu.people.map((p) => (
                <RagBar key={p.id} label={p.name} value={p.pct} href={`/person/${p.id}${qp}`} />
              ))
            ) : (
              <p className="text-sm text-mfa-muted">No one assigned yet.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
