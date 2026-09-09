import Link from "next/link"
import { getSessionUser } from "@/lib/session"
import { db } from "@/lib/db"
import { canOpenAdHocFor } from "@/modules/review/authz"
import { findReviewIdFor } from "@/modules/review/queries"
import { openAdHocReview } from "@/modules/review/actions/open"

// Small entry point on the person page. Shows a link to the existing review for
// this person+period, or a "Start review" button for a manager/admin.
//
// This is an un-suspended async server component living on the OMA person page,
// so any throw here would fail that whole route. It is deliberately fail-soft:
// a review-side problem degrades to "no link" rather than taking down /person.
export async function PersonReviewLink({
  subjectId,
  periodId,
  periodLabel,
}: {
  subjectId: string
  periodId: string
  periodLabel: string
}) {
  try {
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

    // openAdHocReview throws for a subject with no OMAs this period, and this is
    // a server-component <form action> — that throw would be an error screen on
    // a live OMA page. Don't offer the button when there is nothing to review.
    const omaCount = await db.oMA.count({ where: { ownerId: subjectId, periodId } })
    if (omaCount === 0) return null

    return (
      <form action={openAdHocReview.bind(null, subjectId, periodId)}>
        <button className="text-sm font-semibold text-mfa-red hover:underline">
          Start review · {periodLabel}
        </button>
      </form>
    )
  } catch {
    return null
  }
}
