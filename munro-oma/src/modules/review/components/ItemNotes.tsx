"use client"

import { useState, useTransition } from "react"
import { setItemComment, setItemNote } from "@/modules/review/actions/score"

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
  const [pending, start] = useTransition()
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
          onClick={() => start(() => setItemComment(reviewId, itemId, text))}
          className="mt-1 rounded-full bg-mfa-red px-4 py-1 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save comment"}
        </button>
      )}
    </div>
  )
}

export function RowNote({
  reviewId,
  itemId,
  refId,
  kind,
  value,
}: {
  reviewId: string
  itemId: string
  refId: string
  kind: "kpi" | "action"
  value: string
}) {
  const [text, setText] = useState(value)
  const [pending, start] = useTransition()
  const dirty = text !== value
  return (
    <div className="mt-1 flex items-start gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note"
        className="flex-1 rounded border border-mfa-track px-2 py-1 text-xs"
      />
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => setItemNote(reviewId, itemId, refId, kind, text))}
          className="rounded-full bg-mfa-red px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          Save
        </button>
      )}
    </div>
  )
}
