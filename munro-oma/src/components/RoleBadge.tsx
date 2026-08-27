import type { Role } from "@/types"

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="rounded-full border border-mfa-track px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-mfa-muted">
      {role}
    </span>
  )
}
