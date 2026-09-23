"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

// "Back" means one step up the OMA hierarchy (edit -> OMA -> person -> BU ->
// dashboard), not the browser's session history — history back can land
// anywhere (a different page entirely, or off the app) depending on how the
// page was reached, which reads as "Back" randomly skipping levels. Every
// call site should pass its own parent's href; router.back() is a fallback
// for the rare page with no fixed parent to point to.
export function BackButton({ href }: { href?: string }) {
  const router = useRouter()
  const className =
    "mb-3 inline-flex items-center gap-1 text-sm font-semibold text-mfa-muted hover:text-mfa-ink"
  if (href) {
    return (
      <Link href={href} className={className}>
        <span aria-hidden>←</span> Back
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => router.back()} className={className}>
      <span aria-hidden>←</span> Back
    </button>
  )
}
