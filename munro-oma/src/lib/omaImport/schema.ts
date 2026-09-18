import { z } from "zod/v4"

export const extractedKpiSchema = z.object({
  measure: z.string(),
  // .meta({ type: "string" }) is load-bearing, not decorative: zod/v4's
  // z.enum() emits JSON Schema as `{ enum: [...] }` with no "type" key (valid
  // per spec — enum alone implies the value set), but @anthropic-ai/sdk's
  // zodOutputFormat() strict-schema transform throws "JSON schema must have
  // a type defined" on any node lacking type/anyOf/oneOf/allOf. The .meta()
  // call attaches to zod's global metadata registry, which z.toJSONSchema
  // merges onto the generated node — restoring the type key the transform
  // requires, without changing runtime validation.
  unit: z.enum(["NUMBER", "CURRENCY", "PERCENT", "DAYS"]).meta({ type: "string" }).nullable(),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]).meta({ type: "string" }).nullable(),
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
