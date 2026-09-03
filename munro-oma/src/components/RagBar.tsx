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
  const clickable = !!(href || formAction)
  // Same padding/hover slot on every row, clickable or not, so a plain row
  // (e.g. Total Average) still lines up exactly with the clickable ones
  // around it — only the highlight and chevron are conditional.
  const row = (
    <div
      className={`-mx-2 flex items-center gap-6 rounded-md px-2 py-3 ${
        clickable ? "transition-colors hover:bg-mfa-panel" : ""
      }`}
    >
      <span className="w-44 shrink-0 font-semibold">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-md bg-mfa-track">
        <div className="h-full rounded-md" style={{ width: `${value}%`, background: ragColorVar(ragState(value)) }} />
      </div>
      <span className="w-14 shrink-0 text-right font-semibold">{value}%</span>
      <span className="w-9 shrink-0 text-right text-[10px] uppercase tracking-wide text-mfa-muted/50" aria-hidden>
        {clickable ? "Click" : ""}
      </span>
      <span className="w-3 shrink-0 text-mfa-muted" aria-hidden>
        {clickable ? "›" : ""}
      </span>
    </div>
  )
  if (formAction) {
    return (
      <form action={formAction}>
        <button type="submit" className="block w-full text-left">
          {row}
        </button>
      </form>
    )
  }
  return href ? <Link href={href} className="block">{row}</Link> : row
}
