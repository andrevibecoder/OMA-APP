import Link from "next/link"
import { getSessionUser } from "@/lib/session"
import { db } from "@/lib/db"
import { canOpenAdHocFor } from "@/modules/review/authz"
import { findReviewIdFor } from "@/modules/review/queries"
import { openAdHocReview } from "@/modules/review/actions/open"

// Small entry point on the person page. Shows a link to the existing review for
// this person+period, or a "Start review" button for a manager/admin.
export async function PersonReviewLink({
  subjectId,
  periodId,
  periodLabel,
}: {
  subjectId: string
  periodId: string
  periodLabel: string
}) {
  const viewer = await getSessionUser()
  const reviewId = await findReviewIdFor(subjectId, periodId)

  if (reviewId) {
    return (
      <Link
        href={`/review/${reviewId}`}
        className="text-sm font-semibold text-mfa-red hover:underline"
      >
        Review · {periodLabel} ›
      </Link>
    )
  }

  const subject = await db.user.findUnique({
    where: { id: subjectId },
    select: { id: true, managerId: true },
  })
  if (!subject || !canOpenAdHocFor(viewer, subject)) return null

  return (
    <form action={openAdHocReview.bind(null, subjectId, periodId)}>
      <button className="text-sm font-semibold text-mfa-red hover:underline">
        Start review · {periodLabel}
      </button>
    </form>
  )
}
