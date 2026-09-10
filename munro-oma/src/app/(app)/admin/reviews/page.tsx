import Link from "next/link"
import { redirect } from "next/navigation"
import { BackButton } from "@/components/BackButton"
import { PageTitle } from "@/components/PageTitle"
import { getSessionUser } from "@/lib/session"
import { listPeriods, resolvePeriodId } from "@/lib/periods"
import {
  getAllReviews,
  getPeriodReviewOverview,
  getSubjectsToOpenCount,
} from "@/modules/review/queries"
import { BatchOpenButton } from "@/modules/review/components/BatchOpenButton"

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: { period?: string }
}) {
  const viewer = await getSessionUser()
  if (viewer.role !== "ADMIN") redirect("/")

  const periods = await listPeriods()
  const periodId = await resolvePeriodId(searchParams.period)
  const periodLabel = periods.find((p) => p.id === periodId)?.label ?? ""

  const [overview, toOpenCount, rows] = await Promise.all([
    getPeriodReviewOverview(periodId),
    getSubjectsToOpenCount(periodId),
    getAllReviews({ periodId }),
  ])

  return (
    <main>
      <BackButton />
      <div className="mt-3">
        <PageTitle>Reviews — Admin</PageTitle>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`/admin/reviews?period=${p.id}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              p.id === periodId ? "bg-mfa-red text-white" : "bg-mfa-panel text-mfa-muted"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-mfa-panel px-5 py-4 text-sm">
        <p>
          <span className="font-semibold">{overview.eligible}</span> people with OMAs ·{" "}
          <span className="font-semibold">{overview.reviews}</span> reviews ·{" "}
          <span className="font-semibold">{overview.completed}</span> completed
        </p>
        <div className="mt-3">
          <BatchOpenButton
            periodId={periodId}
            periodLabel={periodLabel}
            toOpen={toOpenCount}
          />
        </div>
      </div>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-mfa-track text-left text-xs uppercase tracking-widest text-mfa-muted">
            <th className="py-2">Person</th>
            <th className="py-2">Scorer</th>
            <th className="py-2">Status</th>
            <th className="py-2">Score</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-mfa-track">
              <td className="py-2 font-semibold">{r.subjectName}</td>
              <td className="py-2 text-mfa-muted">{r.scorerName}</td>
              <td className="py-2">
                {r.status === "COMPLETED" ? "Completed" : `Open (${r.rated}/${r.total})`}
              </td>
              <td className="py-2">{r.finalScore === null ? "—" : `Avg ${r.finalScore.toFixed(1)}`}</td>
              <td className="py-2 text-right">
                <Link href={`/review/${r.id}`} className="font-semibold text-mfa-red">
                  Open ›
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-mfa-muted">
                No reviews for {periodLabel} yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
