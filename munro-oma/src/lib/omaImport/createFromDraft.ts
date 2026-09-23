import { omaSaveBlockers } from "@/lib/omaValidation"
import type { DraftOma } from "./toDraft"

// Mirrors the caps in src/types.ts's saveOmaSchema (.max(10) metrics, .max(50)
// actions) — omaSaveBlockers doesn't itself enforce them (that's a Zod-only
// cap on the manual-save path), so an import must check them independently.
const MAX_METRICS = 10
const MAX_ACTIONS = 50

export function draftOmaBlockers(oma: DraftOma): string[] {
  const blockers = omaSaveBlockers({
    title: oma.title,
    outcome: oma.outcome,
    metrics: oma.metrics.map((m) => ({ measure: m.measure, target: m.target })),
  })
  if (oma.metrics.length > MAX_METRICS) {
    blockers.push(`Too many KPI rows (max ${MAX_METRICS}) — merge or remove some before creating.`)
  }
  if (oma.actions.length > MAX_ACTIONS) {
    blockers.push(`Too many actions (max ${MAX_ACTIONS}) — remove some before creating.`)
  }
  return blockers
}

// Mirrors buildCopiedOmaData's shape exactly (src/lib/omaCopy.ts) — a single
// db.oMA.create({ data }) payload with nested metric/action creates. Imported
// metrics default to current: 0 (editable on the review page) and always
// source: "MANUAL" (import never links an API metric).
export function buildCreatePayload(
  oma: DraftOma,
  ownerId: string,
  createdById: string,
  periodId: string,
  sequence: number,
  periodStartDate: Date,
  periodEndDate: Date | null,
) {
  return {
    ownerId,
    createdById,
    periodId,
    sequence,
    date: periodStartDate,
    endDate: periodEndDate,
    title: oma.title,
    outcome: oma.outcome,
    metrics: {
      create: oma.metrics
        .filter((m) => m.measure.trim())
        .map((m, i) => ({
          measure: m.measure,
          unit: m.unit,
          direction: m.direction,
          target: m.target,
          current: m.current,
          order: i,
          source: "MANUAL" as const,
          apiUrl: null,
          apiPath: null,
          apiKey: null,
          sourceNote: m.note?.trim() || null,
        })),
    },
    actions: {
      create: oma.actions
        .filter((a) => a.description.trim())
        .map((a, i) => ({
          description: a.description,
          dueDate: a.dueDate ? new Date(a.dueDate) : null,
          completed: a.completed,
          completedAt: a.completed ? new Date() : null,
          order: i,
        })),
    },
  }
}
