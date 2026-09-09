import { notFound } from "next/navigation"
import { BackButton } from "@/components/BackButton"
import { PageTitle } from "@/components/PageTitle"
import {
  formatMetricValue,
  metricAttainment,
  metricBarPercent,
  ragColorVar,
  ragState,
} from "@/lib/progress"
import { getSessionUser } from "@/lib/session"
import { getReview } from "@/modules/review/queries"
import { canDeleteReview, canScore, canViewScorecard } from "@/modules/review/authz"
import { canComplete, ratingLabel, runningAverage } from "@/modules/review/scoring"
import { RatingControl } from "@/modules/review/components/RatingControl"
import { CommentBox, RowNote } from "@/modules/review/components/ItemNotes"
import { ScorecardFooter } from "@/modules/review/components/ScorecardFooter"
import type { ItemNote, SnapshotAction, SnapshotKpi } from "@/modules/review/snapshot"

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const sectionBar = "rounded-xl bg-mfa-muted px-5 py-2 text-sm font-semibold text-white"

export default async function ScorecardPage({ params }: { params: { reviewId: string } }) {
  const review = await getReview(params.reviewId)
  if (!review) notFound()
  const viewer = await getSessionUser()
  const shape = {
    subjectId: review.subjectId,
    subject: { managerId: review.subject.managerId },
    scorerId: review.scorerId,
    status: review.status,
  }
  // notFound, not redirect: an authed user shouldn't be able to tell "missing"
  // from "forbidden".
  if (!canViewScorecard(viewer, shape)) notFound()
  const mayScore = canScore(viewer, shape) && review.status === "OPEN"

  const noteFor = (notes: unknown, ref: string): string | null =>
    ((notes as ItemNote[] | null)?.find((n) => n.ref === ref)?.text ?? "") || null

  const items = review.items.map((i) => ({ rating: i.rating }))
  const score = review.status === "COMPLETED" ? review.finalScore : runningAverage(items)
  const scoreLabel = review.status === "COMPLETED" ? "Final score" : "Average so far"

  return (
    <main>
      <BackButton />
      <div className="mt-3">
        <PageTitle>{review.subject.name} — OMA Scorecard</PageTitle>
        <p className="mt-1 text-sm font-semibold text-mfa-muted">
          {review.period.label} · {review.status === "COMPLETED" ? "Completed" : "In review"}
          {review.reviewDate ? ` · ${fmtDate(review.reviewDate)}` : ""}
        </p>
      </div>

      <div className="mt-10 space-y-10">
        {review.items.map((item) => {
          const kpis = item.kpis as unknown as SnapshotKpi[]
          const actions = item.actions as unknown as SnapshotAction[]
          const todo = actions.filter((a) => !a.completed)
          const done = actions.filter((a) => a.completed)

          const noteRow = (ref: string, kind: "kpi" | "action") => {
            const note = noteFor(item.notes, ref)
            if (mayScore) {
              return (
                <div className="border-t border-mfa-track px-5 py-2">
                  <RowNote
                    reviewId={review.id}
                    itemId={item.id}
                    refId={ref}
                    kind={kind}
                    value={note ?? ""}
                  />
                </div>
              )
            }
            return note ? (
              <p className="border-t border-mfa-track px-5 py-2 text-xs text-mfa-muted">
                <span className="font-semibold">Note:</span> {note}
              </p>
            ) : null
          }

          return (
            <div key={item.id} className="overflow-hidden rounded-2xl border border-mfa-track">
              <div className="flex flex-wrap items-center gap-3 bg-mfa-red px-5 py-3 text-white">
                <span className="rounded bg-white/15 px-2 py-0.5 text-sm font-bold">
                  OMA {item.sequence}
                </span>
                <span className="text-lg font-bold">{item.title}</span>
              </div>

              <div className="space-y-6 px-5 py-6">
                <section>
                  <div className={sectionBar}>
                    OUTCOME <span className="text-white/70">— the result you&apos;re aiming for</span>
                  </div>
                  <p className="mt-3 rounded-xl bg-mfa-panel px-5 py-4">{item.outcome}</p>
                </section>

                <section>
                  <div className={sectionBar}>
                    METRIC / KPI{" "}
                    <span className="text-white/70">— how you&apos;ll know you&apos;re getting there</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {kpis.map((k) => {
                      const bar = metricBarPercent(k)
                      const real = metricAttainment(k)
                      return (
                        <div key={k.ref} className="overflow-hidden rounded-xl bg-mfa-panel">
                          <div className="grid grid-cols-1 divide-y divide-mfa-track text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                            <div className="px-5 py-3">
                              <span className="font-semibold">KPI:</span> {k.measure}
                            </div>
                            <div className="px-5 py-3">
                              <span className="font-semibold">Target:</span>{" "}
                              {formatMetricValue(k.target, k.unit)}
                            </div>
                            <div className="px-5 py-3">
                              <span className="font-semibold">Current:</span>{" "}
                              {formatMetricValue(k.current, k.unit)}
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
                            {k.direction === "LOWER_BETTER" && (
                              <span className="shrink-0 text-xs text-mfa-muted">lower is better</span>
                            )}
                          </div>
                          {noteRow(k.ref, "kpi")}
                        </div>
                      )
                    })}
                    {kpis.length === 0 && <p className="text-sm text-mfa-muted">No metric set.</p>}
                  </div>
                </section>

                <section>
                  <div className={sectionBar}>
                    ACTIONS — 3-2-Thrive{" "}
                    <span className="text-white/70">— projects that drive results</span>
                  </div>
                  <div className="mt-3 space-y-4">
                    {actions.length === 0 && <p className="text-sm text-mfa-muted">No actions.</p>}
                    {todo.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                          To do
                        </h3>
                        <ul className="space-y-2">
                          {todo.map((a) => (
                            <li key={a.ref} className="overflow-hidden rounded-xl bg-mfa-panel">
                              <div className="flex items-center gap-4 px-5 py-3">
                                <span className="flex-1">{a.description}</span>
                                {a.dueDate && (
                                  <span className="shrink-0 text-sm text-mfa-muted">
                                    Due {fmtDate(a.dueDate)}
                                  </span>
                                )}
                              </div>
                              {noteRow(a.ref, "action")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {done.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                          Done ({done.length})
                        </h3>
                        <ul className="space-y-2">
                          {done.map((a) => (
                            <li key={a.ref} className="overflow-hidden rounded-xl bg-mfa-panel">
                              <div className="flex items-center gap-4 px-5 py-3">
                                <span className="flex-1 text-mfa-muted line-through">
                                  {a.description}
                                </span>
                                <span className="shrink-0 text-sm text-mfa-muted">Completed</span>
                              </div>
                              {noteRow(a.ref, "action")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <div className={sectionBar}>
                    RATING <span className="text-white/70">— 1 Below · 2 Meets · 3 Exceeds</span>
                  </div>
                  <div className="mt-3">
                    {mayScore ? (
                      <>
                        <RatingControl
                          reviewId={review.id}
                          itemId={item.id}
                          value={item.rating}
                        />
                        <CommentBox reviewId={review.id} itemId={item.id} value={item.comment} />
                      </>
                    ) : (
                      <>
                        <p className="font-semibold">
                          {item.rating ? (
                            ratingLabel(item.rating)
                          ) : (
                            <span className="text-mfa-muted">Not yet rated</span>
                          )}
                        </p>
                        {item.comment && <p className="mt-2 text-sm">{item.comment}</p>}
                      </>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-10 rounded-xl bg-mfa-panel px-5 py-4">
        <span className="text-sm font-semibold text-mfa-muted">{scoreLabel}: </span>
        <span className="text-lg font-bold">
          {score === null || score === undefined ? "—" : `${score} / 3`}
        </span>
      </div>

      <ScorecardFooter
        reviewId={review.id}
        status={review.status}
        canScore={canScore(viewer, shape)}
        canComplete={canComplete(review.items.map((i) => ({ rating: i.rating })))}
        canDelete={canDeleteReview(viewer)}
      />
    </main>
  )
}
