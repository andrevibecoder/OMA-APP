export type Role = "ADMIN" | "MANAGER" | "USER"

export type RagState = "not-started" | "behind" | "in-progress" | "on-track"

export interface SessionUser {
  id: string
  name: string
  role: Role
  businessUnitId: string | null
  managerId: string | null
}
