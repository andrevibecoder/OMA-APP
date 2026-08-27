import type { MetricDirection, MetricUnit, RagState } from "@/types"

export function ragState(pct: number): RagState {
  if (pct <= 0) return "not-started"
  if (pct <= 49) return "behind"
  if (pct <= 79) return "in-progress"
  return "on-track"
}

export function ragColorVar(state: RagState): string {
  switch (state) {
    case "not-started":
      return "transparent"
    case "behind":
      return "var(--rag-red)"
    case "in-progress":
      return "var(--rag-amber)"
    case "on-track":
      return "var(--rag-green)"
  }
}

// ---------------------------------------------------------------------------
// Metric value formatting — values are stored raw (Float); formatting is
// applied only on display, based on the unit.
// ---------------------------------------------------------------------------

function groupThousands(n: number): string {
  const negative = n < 0
  const abs = Math.abs(n)
  const intPart = Math.trunc(abs)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  const fraction = abs - Math.trunc(abs)
  const fractionStr =
    fraction > 0 ? "." + fraction.toFixed(2).slice(2).replace(/0+$/, "") : ""
  return (negative ? "-" : "") + intPart + fractionStr
}

export function formatMetricValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "CURRENCY":
      return "R" + groupThousands(Math.round(value))
    case "NUMBER":
      return groupThousands(Math.round(value))
    case "PERCENT":
      return groupThousands(value) + "%"
    case "DAYS":
      return groupThousands(value) + " days"
  }
}

// ---------------------------------------------------------------------------
// Attainment — how far current has moved toward target.
// ---------------------------------------------------------------------------

type MetricLike = {
  direction: MetricDirection
  target: number
  current: number
}

/** Real attainment %, rounded. Can exceed 100 (target beaten). 0 for the
 *  degenerate cases (no usable target, or nothing measured yet). */
export function metricAttainment(m: MetricLike): number {
  const { direction, target, current } = m
  let ratio: number
  if (direction === "LOWER_BETTER") {
    if (current <= 0) return target > 0 ? 100 : 0
    ratio = target / current
  } else {
    if (target <= 0) return 0
    ratio = current / target
  }
  const pct = Math.round(ratio * 100)
  return pct < 0 ? 0 : pct
}

/** Attainment capped at 100 — what a progress bar should show. */
export function metricBarPercent(m: MetricLike): number {
  return Math.min(metricAttainment(m), 100)
}

// ---------------------------------------------------------------------------
// Roll-ups — every bar above metric level is a mean of the level below,
// using the capped (0–100) metric percentages.
// ---------------------------------------------------------------------------

type OmaLike = { metrics: MetricLike[] }

export function omaProgress(oma: OmaLike): number {
  if (oma.metrics.length === 0) return 0
  return mean(oma.metrics.map(metricBarPercent))
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length)
}

export function personProgress(omas: OmaLike[]): number {
  return mean(omas.map(omaProgress))
}

export function buProgress(people: { omas: OmaLike[] }[]): number {
  const withOmas = people.filter((p) => p.omas.length > 0)
  return mean(withOmas.map((p) => personProgress(p.omas)))
}
