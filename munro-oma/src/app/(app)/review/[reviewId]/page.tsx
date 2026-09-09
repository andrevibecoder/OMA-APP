import { Fragment } from "react"
import { notFound, redirect } from "next/navigation"
import { BackButton } from "@/components/BackButton"
import { PageTitle } from "@/components/PageTitle"
import { formatMetricValue } from "@/lib/progress"
import { getSessionUser } from "@/lib/session"
import { getReview } from "@/modules/review/queries"
import { canScore, canViewScorecard } from "@/modules/review/authz"
import { canComplete, ratingLabel, runningAverage } from "@/modules/review/scoring"
import { RatingControl } from "@/modules/review/components/RatingControl"
import { CommentBox, RowNote } from "@/modules/review/components/ItemNotes"
import { ScorecardFooter } from "@/modules/review/components/ScorecardFooter"
import type { ItemNote, SnapshotAction, SnapshotKpi } from "@/modules/review/snapshot"

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

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
  if (!canViewScorecard(viewer, shape)) redirect("/review")
  const mayScore = canScore(viewer, shape) && review.status === "OPEN"

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
          return (
            <section key={item.id} className="rounded-2xl border-2 border-mfa-track">
              <div className="bg-mfa-red px-5 py-3 text-white">
                <span className="rounded bg-white/15 px-2 py-0.5 text-sm font-bold">
                  OMA {item.sequence}
                </span>
                <span className="ml-3 text-lg font-bold">{item.title}</span>
              </div>

              <div className="border-b border-mfa-track px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                  Outcome
                </p>
                <p className="mt-1">{item.outcome}</p>
              </div>

              <div className="border-b border-mfa-track px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                  Metric / KPI
                </p>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {kpis.map((k) => (
                      <Fragment key={k.ref}>
                        <tr className="border-t border-mfa-track first:border-t-0">
                          <td className="py-2 font-semibold">{k.measure}</td>
                          <td className="py-2">Target {formatMetricValue(k.target, k.unit)}</td>
                          <td className="py-2">Current {formatMetricValue(k.current, k.unit)}</td>
                        </tr>
                        {mayScore && (
                          <tr>
                            <td colSpan={3} className="pb-2">
                              <RowNote
                                reviewId={review.id}
                                itemId={item.id}
                                refId={k.ref}
                                kind="kpi"
                                value={
                                  (item.notes as unknown as ItemNote[])?.find((n) => n.ref === k.ref)
                                    ?.text ?? ""
                                }
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {kpis.length === 0 && (
                      <tr><td className="py-2 text-mfa-muted">No KPI.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-b border-mfa-track px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                  Actions
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {actions.map((a) => (
                    <li key={a.ref}>
                      <span className={a.completed ? "text-mfa-muted line-through" : ""}>
                        {a.description}
                        {a.dueDate ? ` — due ${fmtDate(a.dueDate)}` : ""}
                      </span>
                      {mayScore && (
                        <RowNote
                          reviewId={review.id}
                          itemId={item.id}
                          refId={a.ref}
                          kind="action"
                          value={
                            (item.notes as unknown as ItemNote[])?.find((n) => n.ref === a.ref)
                              ?.text ?? ""
                          }
                        />
                      )}
                    </li>
                  ))}
                  {actions.length === 0 && <li className="text-mfa-muted">No actions.</li>}
                </ul>
              </div>

              <div className="px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                  Rating
                </p>
                {mayScore ? (
                  <div className="mt-1">
                    <RatingControl reviewId={review.id} itemId={item.id} value={item.rating} />
                    <CommentBox reviewId={review.id} itemId={item.id} value={item.comment} />
                  </div>
                ) : (
                  <>
                    <p className="mt-1 font-semibold">
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
      />
    </main>
  )
}
