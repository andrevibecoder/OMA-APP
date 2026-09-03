import type { SessionUser } from "@/types"

export type OmaAuthShape = {
  ownerId: string
  owner: { managerId: string | null }
  // A locked period is the historical record — only Admin may still touch
  // its OMAs (edit, tick actions, delete). Independent of Period.isActive.
  periodLocked: boolean
  // Who actually started this OMA — distinct from ownerId. An owner may set
  // their own Outcome/Metric only on an OMA they created themselves; one a
  // manager set up for them stays manager/admin-only there.
  createdById: string | null
}

function managesOwner(user: SessionUser, oma: OmaAuthShape): boolean {
  return oma.owner.managerId !== null && oma.owner.managerId === user.id
}

export function canEditOutcomeMetric(user: SessionUser, oma: OmaAuthShape): boolean {
  if (user.role === "ADMIN") return true
  if (oma.periodLocked) return false
  if (user.role === "MANAGER" && managesOwner(user, oma)) return true
  if (oma.ownerId === user.id && oma.createdById === user.id) return true // self-created, self-defined
  return false
}

export function canEditActions(user: SessionUser, oma: OmaAuthShape): boolean {
  if (user.role === "ADMIN") return true
  if (oma.periodLocked) return false
  if (oma.ownerId === user.id) return true
  if (user.role === "MANAGER") return managesOwner(user, oma)
  return false
}

export function canCreateOMA(
  user: SessionUser,
  target: { id: string; managerId: string | null },
  periodLocked: boolean,
): boolean {
  if (user.role === "ADMIN") return true
  if (periodLocked) return false
  if (user.id === target.id) return true // the person can start their own OMA
  if (user.role === "MANAGER") return target.managerId !== null && target.managerId === user.id
  return false
}

export function canEditProfile(user: SessionUser, userId: string): boolean {
  return user.id === userId
}

export function canEditOma(user: SessionUser, oma: OmaAuthShape): boolean {
  return canEditOutcomeMetric(user, oma) || canEditActions(user, oma)
}
