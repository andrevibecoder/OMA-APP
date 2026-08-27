export type Role = "ADMIN" | "MANAGER" | "USER"

export type RagState = "not-started" | "behind" | "in-progress" | "on-track"

export interface SessionUser {
  id: string
  name: string
  role: Role
  businessUnitId: string | null
  managerId: string | null
}

export type SaveOmaInput = {
  omaId: string
  outcome: string
  metrics: { measure: string; target: string }[]
  actions: { id?: string; description: string; dueDate: string | null; completed: boolean }[]
}
