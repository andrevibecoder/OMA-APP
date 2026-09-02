import Link from "next/link"
import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { BackButton } from "@/components/BackButton"
import { RagBar } from "@/components/RagBar"
import { getPerson } from "@/lib/queries"
import { formatMetricValue, ragColorVar, ragState } from "@/lib/progress"
import { db } from "@/lib/db"
import { resolvePeriodId } from "@/lib/periods"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"
import { createOma } from "./actions"

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: { userId: string }
  searchParams: { period?: string }
}) {
  const periodId = await resolvePeriodId(searchParams.period)
  const period = await db.period.findUniqueOrThrow({ where: { id: periodId } })
  const person = await getPerson(params.userId, periodId)
  if (!person) notFound()
  const viewer = await getSessionUser()
  const target = await db.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { id: true, managerId: true },
  })
  const mayAdd = canCreateOMA(viewer, target, period.locked)
  const qp = searchParams.period ? `?period=${periodId}` : ""

  return (
    <main>
      <BackButton />
      <Breadcrumbs
        items={[
          ...(person.businessUnit
            ? [{ label: person.businessUnit.name, href: `/bu/${person.businessUnit.id}${qp}` }]
            : []),
          { label: person.name },
          { label: period.shortLabel },
        ]}
      />
      <div className="mt-3">
        <PageTitle>{person.name} — OMAs</PageTitle>
      </div>
      <div className="mt-10 space-y-4">
        {person.omas.length > 0 ? (
          person.omas.map((o) => {
            const primary = o.metrics[0]
            const extra = o.metrics.length - 1
            return (
              <Link
                key={o.id}
                href={`/oma/${o.id}/edit${qp}`}
                className="block overflow-hidden rounded-xl bg-mfa-panel hover:bg-mfa-track/50"
              >
                <div className="flex items-center gap-3 px-5 py-2">
                  <span className="shrink-0 font-semibold">OMA {o.sequence}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-mfa-muted">
                    {o.outcome || <em>Not set yet.</em>}
                  </span>
                  <span className="shrink-0 text-mfa-muted">›</span>
                </div>
                {primary ? (
                  <div className="grid grid-cols-1 divide-y divide-mfa-track border-t border-mfa-track text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="px-5 py-3">
                      <span className="font-semibold">KPI:</span> {primary.measure}
                      {extra > 0 && (
                        <span className="ml-1 text-xs text-mfa-muted">
                          +{extra} more
                        </span>
                      )}
                    </div>
                    <div className="px-5 py-3">
                      <span className="font-semibold">Target:</span>{" "}
                      {formatMetricValue(primary.target, primary.unit)}
                    </div>
                    <div className="px-5 py-3">
                      <span className="font-semibold">Current:</span>{" "}
                      {formatMetricValue(primary.current, primary.unit)}
                    </div>
                  </div>
                ) : (
                  <p className="border-t border-mfa-track px-5 py-3 text-sm text-mfa-muted">
                    No metric set yet.
                  </p>
                )}
                <div className="flex items-center gap-3 border-t border-mfa-track px-5 py-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-md bg-mfa-track">
                    <div
                      className="h-full rounded-md"
                      style={{ width: `${o.pct}%`, background: ragColorVar(ragState(o.pct)) }}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{o.pct}%</span>
                </div>
              </Link>
            )
          })
        ) : mayAdd ? (
          // Nothing exists yet — the row itself is the "start OMA 1" action,
          // rather than a separate button doing the same thing beside it.
          <RagBar label="OMA 1" value={0} formAction={createOma.bind(null, person.id, periodId)} />
        ) : (
          <RagBar label="OMA 1" value={0} />
        )}
      </div>

      {mayAdd && person.omas.length > 0 && (
        <div className="mt-12 flex justify-end">
          <form action={createOma.bind(null, person.id, periodId)}>
            <button className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white">
              + Add OMA
            </button>
          </form>
        </div>
      )}
    </main>
  )
}
