// Shared rule for "is this OMA complete enough to save?" — used both client-side
// (instant feedback on the edit form) and server-side (saveOma refuses to persist
// a half-done OMA). An OMA that saved without a title or a metric shows as a bare
// "OMA 1" / 0% / "No metric set yet", which reads to the owner as "it didn't save".

type MetricShape = { measure: string; target: number }

export function omaSaveBlockers(input: {
  title: string
  outcome: string
  metrics: MetricShape[]
}): string[] {
  const problems: string[] = []

  if (!input.title.trim()) problems.push("Add a title before saving.")

  if (!input.outcome.trim()) problems.push("Add an outcome before saving.")

  const rows = input.metrics.map((m) => ({
    named: m.measure.trim().length > 0,
    targeted: m.target > 0,
  }))
  const complete = rows.filter((r) => r.named && r.targeted)
  const partial = rows.filter((r) => (r.named || r.targeted) && !(r.named && r.targeted))

  if (partial.length > 0) {
    problems.push("Every KPI needs both a name and a target.")
  } else if (complete.length === 0) {
    problems.push("Add at least one KPI with a target.")
  }

  return problems
}
