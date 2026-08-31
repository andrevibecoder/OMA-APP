import Link from "next/link"
import { ragColorVar, ragState } from "@/lib/progress"

export function RagBar({
  label,
  value,
  href,
  formAction,
}: {
  label: string
  value: number
  href?: string
  // Alternative to href: a bound server action, so the whole row acts as a
  // submit button (e.g. "create and open OMA 1") instead of a link.
  formAction?: () => Promise<void>
}) {
  const row = (
    <div className="flex items-center gap-6 py-3">
      <span className="w-44 shrink-0 font-semibold">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-md bg-mfa-track">
        <div className="h-full rounded-md" style={{ width: `${value}%`, background: ragColorVar(ragState(value)) }} />
      </div>
      <span className="w-14 shrink-0 text-right font-semibold">{value}%</span>
    </div>
  )
  if (formAction) {
    return (
      <form action={formAction}>
        <button type="submit" className="block w-full text-left hover:opacity-80">
          {row}
        </button>
      </form>
    )
  }
  return href ? <Link href={href} className="block hover:opacity-80">{row}</Link> : row
}
