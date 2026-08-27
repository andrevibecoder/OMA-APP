import Link from "next/link"

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
      {items.map((it, i) => {
        const last = i === items.length - 1
        const cls = last || !it.href ? "text-mfa-red" : "text-mfa-muted hover:underline"
        return (
          <span key={i} className="flex items-center gap-2">
            {it.href && !last ? (
              <Link href={it.href} className={cls}>
                {it.label}
              </Link>
            ) : (
              <span className={cls}>{it.label}</span>
            )}
            {!last && <span className="text-mfa-track">/</span>}
          </span>
        )
      })}
    </nav>
  )
}
