import Link from "next/link"
import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { BackButton } from "@/components/BackButton"
import { ActionCheckbox } from "@/components/ActionCheckbox"
import { DeleteOmaButton } from "@/components/DeleteOmaButton"
import { SaveConfirmButton } from "@/components/SaveConfirmButton"
import { getOma } from "@/lib/queries"
import {
  formatMetricValue,
  metricAttainment,
  metricBarPercent,
  ragColorVar,
  ragState,
} from "@/lib/progress"
import { resolvePeriodId } from "@/lib/periods"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA, canEditActions, canEditOma } from "@/lib/authz"
import { createOma } from "@/app/(app)/person/[userId]/actions"

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export default async function OmaDetailPage({
  params,
  searchParams,
}: {
  params: { omaId: string }
  searchParams: { period?: string }
}) {
  const oma = await getOma(params.omaId)
  if (!oma) notFound()
  const viewer = await getSessionUser()
  const authShape = {
    ownerId: oma.owner.id,
    owner: { managerId: oma.owner.managerId },
    periodLocked: oma.period.locked,
  }
  const canTick = canEditActions(viewer, authShape)
  const showEdit = canEditOma(viewer, authShape)
  const canAdd = canCreateOMA(
    viewer,
    { id: oma.owner.id, managerId: oma.owner.managerId },
    oma.period.locked,
  )
  const periodId = await resolvePeriodId(searchParams.period)
  const qp = searchParams.period ? `?period=${encodeURIComponent(periodId)}` : ""

  return (
    <main>
      <BackButton />
      <Breadcrumbs
        items={[
          ...(oma.owner.businessUnit
            ? [{ label: oma.owner.businessUnit.name, href: `/bu/${oma.owner.businessUnit.id}${qp}` }]
            : []),
          { label: oma.owner.name, href: `/person/${oma.owner.id}${qp}` },
          { label: `OMA ${oma.sequence}` },
          { label: oma.period.shortLabel },
        ]}
      />
      <div className="mt-3">
        <PageTitle>OMA {oma.sequence}</PageTitle>
      </div>

      <div className="mt-10 space-y-8">
        <section>
          <div className="rounded-xl bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">
            OUTCOME <span className="text-white/70">— the result you&apos;re aiming for</span>
          </div>
          <p className="mt-3 rounded-xl bg-mfa-panel px-5 py-4">
            {oma.outcome || <em className="text-mfa-muted">Not set yet.</em>}
          </p>
        </section>

        <section>
          <div className="rounded-xl bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">
            METRIC / KPI{" "}
            <span className="text-white/70">— how you&apos;ll know you&apos;re getting there</span>
          </div>
          <div className="mt-3 space-y-3">
          {oma.metrics.map((m) => {
            const bar = metricBarPercent(m)
            const real = metricAttainment(m)
            return (
              <div key={m.id} className="overflow-hidden rounded-xl bg-mfa-panel">
                <div className="grid grid-cols-1 divide-y divide-mfa-track sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <div className="px-5 py-3">
                    <span className="font-semibold">KPI:</span> {m.measure}
                  </div>
                  <div className="px-5 py-3">
                    <span className="font-semibold">Target:</span> {formatMetricValue(m.target, m.unit)}
                  </div>
                  <div className="px-5 py-3">
                    <span className="font-semibold">Current:</span>{" "}
                    {formatMetricValue(m.current, m.unit)}
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-mfa-track px-5 py-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-mfa-track">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${bar}%`, background: ragColorVar(ragState(bar)) }}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{real}%</span>
                  {m.direction === "LOWER_BETTER" && (
                    <span className="shrink-0 text-xs text-mfa-muted">lower is better</span>
                  )}
                </div>
              </div>
            )
          })}
          {oma.metrics.length === 0 && <p className="text-sm text-mfa-muted">No metric set yet.</p>}
          </div>
        </section>

        <section>
          <div className="rounded-xl bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">
            ACTIONS{" "}
            <span className="text-white/70">— projects that drive results</span>
          </div>
          <div className="mt-3">
          {oma.actions.length === 0 ? (
            <p className="text-sm text-mfa-muted">No actions yet.</p>
          ) : (
          <div className="space-y-6">
            {(() => {
              const todo = oma.actions
                .filter((a) => !a.completed)
                .sort((a, b) => {
                  if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime()
                  if (a.dueDate) return -1
                  if (b.dueDate) return 1
                  return a.order - b.order
                })
              const done = oma.actions
                .filter((a) => a.completed)
                .sort(
                  (a, b) =>
                    (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0),
                )
              const groupHeading = "mb-2 text-xs font-semibold uppercase tracking-widest text-mfa-muted"
              const row = "flex items-center gap-4 rounded-xl bg-mfa-panel px-5 py-3"
              return (
                <>
                  <div>
                    <h3 className={groupHeading}>3-2-Thrive</h3>
                    <ul className="space-y-2">
                      {todo.map((a) => (
                        <li key={a.id} className={row}>
                          {canTick && (
                            <ActionCheckbox actionId={a.id} completed={a.completed} disabled={!canTick} />
                          )}
                          <span className="flex-1">{a.description}</span>
                          {a.dueDate && (
                            <span className="shrink-0 text-sm text-mfa-muted">
                              Due {fmtDate(a.dueDate)}
                            </span>
                          )}
                        </li>
                      ))}
                      {todo.length === 0 && (
                        <li className="text-sm text-mfa-muted">Nothing outstanding.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h3 className={groupHeading}>Done ({done.length})</h3>
                    <ul className="space-y-2">
                      {done.map((a) => (
                        <li key={a.id} className={row}>
                          {(canTick || a.completed) && (
                            <ActionCheckbox actionId={a.id} completed={a.completed} disabled={!canTick} />
                          )}
                          <span className="flex-1 text-mfa-muted line-through">{a.description}</span>
                          <span className="shrink-0 text-sm text-mfa-muted">
                            {a.completedAt ? `Completed ${fmtDate(a.completedAt)}` : "Completed"}
                          </span>
                        </li>
                      ))}
                      {done.length === 0 && (
                        <li className="text-sm text-mfa-muted">Nothing completed yet.</li>
                      )}
                    </ul>
                  </div>
                </>
              )
            })()}
          </div>
          )}
          </div>
        </section>
      </div>

      {(canAdd || showEdit || canTick) && (
        <div className="mt-12 flex justify-end gap-3">
          {canAdd && (
            <form action={createOma.bind(null, oma.owner.id, oma.periodId)}>
              <button className="rounded-full border border-mfa-red px-6 py-2 font-semibold text-mfa-red">
                + Add OMA
              </button>
            </form>
          )}
          {showEdit && <DeleteOmaButton omaId={oma.id} sequence={oma.sequence} />}
          {canTick && <SaveConfirmButton />}
          {showEdit && (
            <Link
              href={`/oma/${oma.id}/edit${qp}`}
              className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white"
            >
              Edit
            </Link>
          )}
        </div>
      )}
    </main>
  )
}
