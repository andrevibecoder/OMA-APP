import Link from "next/link"

function barColor(v: number): string {
  if (v === 0) return "transparent"
  if (v <= 49) return "var(--rag-red)"
  if (v <= 79) return "var(--rag-amber)"
  return "var(--rag-green)"
}

export function RagBar({ label, value, href }: { label: string; value: number; href?: string }) {
  const row = (
    <div className="flex items-center gap-6 py-3">
      <span className="w-40 shrink-0 font-semibold">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-full bg-mfa-track">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: barColor(value) }} />
      </div>
      <span className="w-14 shrink-0 text-right font-semibold">{value}%</span>
    </div>
  )
  return href ? <Link href={href} className="block hover:opacity-80">{row}</Link> : row
}
