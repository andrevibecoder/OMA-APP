import { z } from "zod"

export type Role = "ADMIN" | "MANAGER" | "USER"

export type MetricUnit = "NUMBER" | "CURRENCY" | "PERCENT" | "DAYS"
export type MetricDirection = "HIGHER_BETTER" | "LOWER_BETTER"

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
  periodId: z.string().min(1),
  sequence: z.number().int().min(1).max(3),
  date: z.string().min(1), // ISO yyyy-mm-dd
  outcome: z.string().max(2000),
  metrics: z
    .array(
      z.object({
        measure: z.string().max(200),
        unit: z.enum(["NUMBER", "CURRENCY", "PERCENT", "DAYS"]),
        direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
        target: z.number().finite(),
        current: z.number().finite(),
      }),
    )
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
