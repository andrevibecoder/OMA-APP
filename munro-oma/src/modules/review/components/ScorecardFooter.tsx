"use client"

import { completeReview, deleteReview, reopenReview } from "@/modules/review/actions/lifecycle"
import { useActionError } from "@/modules/review/components/useActionError"

export function ScorecardFooter({
  reviewId,
  status,
  canScore,
  canComplete,
  canDelete,
}: {
  reviewId: string
  status: "OPEN" | "COMPLETED"
  canScore: boolean
  canComplete: boolean
  canDelete: boolean
}) {
  const { pending, run, errorNode } = useActionError()
  if (!canScore && !canDelete) return null

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        {canScore && status === "OPEN" && (
          <button
            type="button"
            disabled={pending || !canComplete}
            onClick={() => run(() => completeReview(reviewId))}
            title={canComplete ? "" : "Score every OMA first"}
            className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-40"
          >
            Complete review
          </button>
        )}
        {canScore && status === "COMPLETED" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => reopenReview(reviewId))}
            className="rounded-full border border-mfa-red px-5 py-2 text-sm font-semibold text-mfa-red disabled:opacity-60"
          >
            Reopen
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "Delete this review? This removes its scores, comments and notes.\n\nThis cannot be undone.",
                )
              ) {
                run(() => deleteReview(reviewId))
              }
            }}
            className="rounded-full border border-mfa-red px-6 py-2 font-semibold text-mfa-red disabled:opacity-60"
          >
            Delete review
          </button>
        )}
      </div>
      {errorNode}
    </div>
  )
}
