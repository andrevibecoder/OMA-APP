"use client"

import { batchOpenReviews } from "@/modules/review/actions/batch"
import { useActionError } from "@/modules/review/components/useActionError"

export function BatchOpenButton({
  periodId,
  periodLabel,
  toOpen,
}: {
  periodId: string
  periodLabel: string
  toOpen: number
}) {
  const { pending, run, errorNode } = useActionError()
  return (
    <div>
      <button
        type="button"
        disabled={pending || toOpen === 0}
        onClick={() => {
          if (window.confirm(`Open reviews for ${toOpen} person(s) in ${periodLabel}?`)) {
            run(() => batchOpenReviews(periodId))
          }
        }}
        className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Opening…" : `Open ${toOpen} review(s) for ${periodLabel}`}
      </button>
      {errorNode}
    </div>
  )
}
