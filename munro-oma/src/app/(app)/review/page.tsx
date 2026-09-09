import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { PageTitle } from "@/components/PageTitle"
import { getSessionUser } from "@/lib/session"
import { getMyScorecards, getReviewsToScore } from "@/modules/review/queries"

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"
}

export default async function ReviewListPage() {
  const viewer = await getSessionUser()
  const [toScore, mine] = await Promise.all([
    viewer.role === "USER" ? Promise.resolve([]) : getReviewsToScore(viewer.id),
    getMyScorecards(viewer.id),
  ])

  return (
    <main>
      <BackButton />
      <div className="mt-3">
        <PageTitle>Reviews</PageTitle>
      </div>

      {viewer.role !== "USER" && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-mfa-muted">
            Reviews to score
          </h2>
          <div className="mt-3 space-y-2">
            {toScore.length === 0 && <p className="text-sm text-mfa-muted">Nothing to score.</p>}
            {toScore.map((r) => (
              <Link
                key={r.id}
                href={`/review/${r.id}`}
                className="flex items-center gap-3 rounded-xl bg-mfa-panel px-5 py-3 hover:bg-mfa-track/50"
              >
                <span className="flex-1 font-semibold">{r.subjectName}</span>
                <span className="text-sm text-mfa-muted">{r.periodLabel}</span>
                <span className="text-sm font-semibold">
                  {r.rated}/{r.total} scored
                </span>
                <span className="text-mfa-muted">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-mfa-muted">
          Your scorecards
        </h2>
        <div className="mt-3 space-y-2">
          {mine.length === 0 && <p className="text-sm text-mfa-muted">No completed reviews yet.</p>}
          {mine.map((r) => (
            <Link
              key={r.id}
              href={`/review/${r.id}`}
              className="flex items-center gap-3 rounded-xl bg-mfa-panel px-5 py-3 hover:bg-mfa-track/50"
            >
              <span className="flex-1 font-semibold">{r.periodLabel}</span>
              <span className="text-sm text-mfa-muted">{fmtDate(r.reviewDate)}</span>
              <span className="text-sm font-semibold">
                {r.finalScore === null ? "—" : `${r.finalScore} / 3`}
              </span>
              <span className="text-mfa-muted">›</span>
            </Link>
          ))}
        </div>
      </section>

      {viewer.role === "ADMIN" && (
        <div className="mt-10">
          <Link href="/admin/reviews" className="text-sm font-semibold text-mfa-red hover:underline">
            Admin: open & track reviews by period ›
          </Link>
        </div>
      )}
    </main>
  )
}
