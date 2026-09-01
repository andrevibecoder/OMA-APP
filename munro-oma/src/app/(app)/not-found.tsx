"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Anything that would 404 (a deleted OMA/business unit, a stale link) just
// lands back on the main dashboard instead of showing a dead-end page.
// redirect() isn't reliable from inside a not-found boundary, so this
// redirects client-side once mounted instead.
export default function NotFound() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/")
  }, [router])
  return null
}
