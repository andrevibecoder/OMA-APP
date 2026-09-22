// Shared rule for "is this OMA complete enough to save?" — used both client-side
// (instant feedback on the edit form) and server-side (saveOma refuses to persist
// a half-done OMA). An OMA that saved without a title or a metric shows as a bare
// "OMA 1" / 0% / "No metric set yet", which reads to the owner as "it didn't save".
//
// A KPI's target/current are deliberately not required here — some owners know
// what they're measuring before they have the number for it, and still gathering
// that data shouldn't block the OMA from saving.

type MetricShape = { measure: string; target: number }

export function omaSaveBlockers(input: {
  title: string
  outcome: string
  metrics: MetricShape[]
}): string[] {
  const problems: string[] = []

  if (!input.title.trim()) problems.push("Add a title before saving.")

  if (!input.outcome.trim()) problems.push("Add an outcome before saving.")

  const named = input.metrics.filter((m) => m.measure.trim().length > 0)
  if (named.length === 0) problems.push("Add at least one KPI.")

  return problems
}
