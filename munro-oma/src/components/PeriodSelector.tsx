"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function PeriodSelector({
  periods,
  value,
}: {
  periods: { id: string; label: string }[]
  value: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  // Reflect the URL's period so the control doesn't visually snap back to the active one.
  const fromUrl = params.get("period")
  const selected = periods.some((p) => p.id === fromUrl) ? (fromUrl as string) : value

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params)
    next.set("period", e.target.value)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <select
      value={selected}
      onChange={onChange}
      className="rounded-full border border-mfa-track px-3 py-1 text-sm font-semibold"
    >
      {periods.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  )
}
