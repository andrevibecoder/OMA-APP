"use client"

import { useState } from "react"
import { setItemComment } from "@/modules/review/actions/score"
import { useActionError } from "@/modules/review/components/useActionError"

export function CommentBox({
  reviewId,
  itemId,
  value,
}: {
  reviewId: string
  itemId: string
  value: string | null
}) {
  const [text, setText] = useState(value ?? "")
  const { pending, run, errorNode } = useActionError()
  const dirty = text !== (value ?? "")
  return (
    <div className="mt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Comment on this OMA"
        className="w-full rounded border border-mfa-track px-3 py-2 text-sm"
      />
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setItemComment(reviewId, itemId, text))}
          className="mt-1 rounded-full bg-mfa-red px-4 py-1 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save comment"}
        </button>
      )}
      {errorNode}
    </div>
  )
}
