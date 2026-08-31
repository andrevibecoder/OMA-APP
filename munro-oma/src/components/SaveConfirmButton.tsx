"use client"

import { useEffect, useState } from "react"

// Every action checkbox on this page already saves itself the instant it's
// ticked — there's nothing left to persist. This button exists purely so
// there's something to click when you're done, with a clear "saved" answer.
export function SaveConfirmButton() {
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 1800)
    return () => clearTimeout(t)
  }, [saved])

  return (
    <button
      type="button"
      onClick={() => setSaved(true)}
      className="rounded-full border border-mfa-red px-6 py-2 font-semibold text-mfa-red"
    >
      {saved ? "Saved ✓" : "Save"}
    </button>
  )
}
