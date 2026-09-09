"use client"

import { completeReview, refreshReview, reopenReview } from "@/modules/review/actions/lifecycle"
import { useActionError } from "@/modules/review/components/useActionError"

export function ScorecardFooter({
  reviewId,
  status,
  canScore,
  canComplete,
}: {
  reviewId: string
  status: "OPEN" | "COMPLETED"
  canScore: boolean
  canComplete: boolean
}) {
  const { pending, run, errorNode } = useActionError()
  if (!canScore) return null

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        {status === "OPEN" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => refreshReview(reviewId))}
              className="rounded-full border border-mfa-red px-5 py-2 text-sm font-semibold text-mfa-red disabled:opacity-60"
            >
              Refresh from current OMAs
            </button>
            <button
              type="button"
              disabled={pending || !canComplete}
              onClick={() => run(() => completeReview(reviewId))}
              title={canComplete ? "" : "Score every OMA first"}
              className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-40"
            >
              Complete review
            </button>
          </>
        )}
        {status === "COMPLETED" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => reopenReview(reviewId))}
            className="rounded-full border border-mfa-red px-5 py-2 text-sm font-semibold text-mfa-red disabled:opacity-60"
          >
            Reopen
          </button>
        )}
      </div>
      {errorNode}
    </div>
  )
}
