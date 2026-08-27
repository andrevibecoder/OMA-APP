import type { SessionUser } from "@/types"

export type OmaAuthShape = { ownerId: string; owner: { managerId: string | null } }

function managesOwner(user: SessionUser, oma: OmaAuthShape): boolean {
  return oma.owner.managerId !== null && oma.owner.managerId === user.id
}

export function canEditOutcomeMetric(user: SessionUser, oma: OmaAuthShape): boolean {
  if (user.role === "ADMIN") return true
  if (user.role === "MANAGER") return managesOwner(user, oma)
  return false
}

export function canEditActions(user: SessionUser, oma: OmaAuthShape): boolean {
  if (user.role === "ADMIN") return true
  if (user.role === "MANAGER") return managesOwner(user, oma)
  return oma.ownerId === user.id
}

export function canCreateOMA(
  user: SessionUser,
  target: { id: string; managerId: string | null },
  currentOmaCount: number,
): boolean {
  if (currentOmaCount >= 3) return false
  if (user.role === "ADMIN") return true
  if (user.role === "MANAGER") return target.managerId !== null && target.managerId === user.id
  return false
}

export function canEditProfile(user: SessionUser, userId: string): boolean {
  return user.id === userId
}

export function canEditOma(user: SessionUser, oma: OmaAuthShape): boolean {
  return canEditOutcomeMetric(user, oma) || canEditActions(user, oma)
}
