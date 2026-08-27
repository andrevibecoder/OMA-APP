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

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params)
    next.set("period", e.target.value)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <select
      value={value}
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
