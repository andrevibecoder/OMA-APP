import Link from "next/link"
import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { ActionCheckbox } from "@/components/ActionCheckbox"
import { getOma } from "@/lib/queries"
import { resolvePeriodId } from "@/lib/periods"
import { getSessionUser } from "@/lib/session"
import { canEditActions, canEditOma } from "@/lib/authz"

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
  const authShape = { ownerId: oma.owner.id, owner: { managerId: oma.owner.managerId } }
  const canTick = canEditActions(viewer, authShape)
  const showEdit = canEditOma(viewer, authShape)
  const periodId = await resolvePeriodId(searchParams.period)
  const qp = searchParams.period ? `?period=${encodeURIComponent(periodId)}` : ""

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <Breadcrumbs
        items={[
          ...(oma.owner.businessUnit
            ? [{ label: oma.owner.businessUnit.name, href: `/bu/${oma.owner.businessUnit.id}${qp}` }]
            : []),
          { label: oma.owner.name, href: `/person/${oma.owner.id}${qp}` },
          { label: `OMA ${oma.sequence}` },
          { label: `Q${oma.period.quarter}` },
        ]}
      />
      <div className="mt-3">
        <PageTitle>OMA {oma.sequence} — detail</PageTitle>
      </div>

      <div className="mt-10 grid grid-cols-[8rem_1fr] gap-x-8 gap-y-8">
        <span className="font-semibold">Outcome</span>
        <p className="rounded-xl bg-mfa-panel px-5 py-4">
          {oma.outcome || <em className="text-mfa-muted">Not set yet.</em>}
        </p>

        <span className="font-semibold">Metric</span>
        <div className="space-y-2">
          {oma.metrics.map((m) => (
            <div key={m.id} className="grid grid-cols-2 overflow-hidden rounded-xl bg-mfa-panel">
              <div className="px-5 py-3">
                <span className="font-semibold">KPI:</span> {m.measure}
              </div>
              <div className="border-l border-mfa-track px-5 py-3">
                <span className="font-semibold">Target:</span> {m.target}
              </div>
            </div>
          ))}
          {oma.metrics.length === 0 && <p className="text-sm text-mfa-muted">No metric set yet.</p>}
        </div>

        <span className="font-semibold">Actions</span>
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
                    <h3 className={groupHeading}>To do ({todo.length})</h3>
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

      {showEdit && (
        <div className="mt-12 flex justify-end">
          <Link
            href={`/oma/${oma.id}/edit${qp}`}
            className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white"
          >
            Edit
          </Link>
        </div>
      )}
    </main>
  )
}
