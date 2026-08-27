import { z } from "zod"

export type Role = "ADMIN" | "MANAGER" | "USER"

export type RagState = "not-started" | "behind" | "in-progress" | "on-track"

export interface SessionUser {
  id: string
  name: string
  role: Role
  businessUnitId: string | null
  managerId: string | null
}

// Runtime schema is the source of truth for saveOma input; SaveOmaInput is derived from it.
export const saveOmaSchema = z.object({
  omaId: z.string().min(1),
  outcome: z.string().max(2000),
  metrics: z
    .array(z.object({ measure: z.string().max(200), target: z.string().max(200) }))
    .max(10),
  actions: z
    .array(
      z.object({
        id: z.string().optional(),
        description: z.string().max(500),
        dueDate: z.string().nullable(),
        completed: z.boolean(),
      }),
    )
    .max(50),
})

export type SaveOmaInput = z.infer<typeof saveOmaSchema>
