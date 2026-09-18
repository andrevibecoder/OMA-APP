import { z } from "zod"

export const extractedKpiSchema = z.object({
  measure: z.string(),
  unit: z.enum(["NUMBER", "CURRENCY", "PERCENT", "DAYS"]).nullable(),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]).nullable(),
  // 3_000_000 from "R3 million"; null from "[TBC]" or pure narrative.
  target: z.number().nullable(),
  // The original target prose — always kept, shown on the review page.
  targetText: z.string(),
})

export const extractedActionSchema = z.object({
  description: z.string(),
  // ISO date only when a real calendar date is present; else null.
  dueDate: z.string().nullable(),
  completed: z.boolean(),
  // "Ongoing" / "In progress (Inani)" — the original status text, verbatim.
  statusText: z.string(),
})

export const extractedOmaSchema = z.object({
  // Short label derived from the outcome heading.
  title: z.string(),
  // The outcome paragraph, verbatim — never summarised.
  outcome: z.string(),
  kpis: z.array(extractedKpiSchema),
  actions: z.array(extractedActionSchema),
})

export const extractedImportSchema = z.object({
  // A hint from the document header — the importer confirms the real subject.
  subjectName: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  omas: z.array(extractedOmaSchema),
  warnings: z.array(z.string()),
})

export type ExtractedKpi = z.infer<typeof extractedKpiSchema>
export type ExtractedAction = z.infer<typeof extractedActionSchema>
export type ExtractedOma = z.infer<typeof extractedOmaSchema>
export type ExtractedImport = z.infer<typeof extractedImportSchema>
