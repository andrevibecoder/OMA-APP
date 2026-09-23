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
// Lenient number entry — lets a user type "3 mill", "3M", "1.5k", "R3,000,000"
// into a target/current field and get 3000000 / 3000000 / 1500 / 3000000.
// Returns null when there's no number to be found.
// ---------------------------------------------------------------------------

const AMOUNT_SUFFIX: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  mil: 1e6,
  mill: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
}

export function parseAmount(raw: string): number | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase().replace(/[r$,\s]/g, "")
  const m = s.match(/^(-?\d*\.?\d+)(million|mill|mil|billion|bn|k|m|b)?$/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  return n * (m[2] ? AMOUNT_SUFFIX[m[2]] : 1)
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

// True when at least one OMA in the group has no usable target (no metrics,
// or every metric's target is unset) — paired with a rolled-up pct of 0, that
// 0% is at least partly an artifact of missing data entry, not a real "no
// progress" signal, and a bare grey bar reads as "nothing here at all"
// instead. Distinguishing this needs the raw metrics, which are gone by the
// time a rolled-up pct reaches the UI — so this is computed alongside pct in
// queries.ts, not derived from it.
export function hasOmasWithNoTargets(omas: OmaLike[]): boolean {
  if (omas.length === 0) return false
  return omas.some((o) => o.metrics.length === 0 || o.metrics.every((m) => m.target <= 0))
}

// True when every OMA has a real target, but not a single metric anywhere has
// a "current" recorded yet (current is 0 by default until someone updates
// it) — a rolled-up 0% here means "nothing's been reported yet", not "no
// target", but it's just as easily mistaken for the empty state above.
export function hasNoRecordedProgress(omas: OmaLike[]): boolean {
  if (omas.length === 0) return false
  return omas.every((o) => o.metrics.every((m) => m.current <= 0))
}

// What a 0% bar should say instead of just "0%" — null when 0% is a real,
// unambiguous progress figure (a target exists and a current has been
// recorded against it, and it genuinely computes to 0). No OMAs at all is
// its own case: there's nothing to inspect to say which of targets/progress
// is missing, so it gets the generic catch-all rather than a blank bar that
// reads as "broken" instead of "not started". Where an OMA does exist,
// targets take priority over current, since a missing target is the more
// fundamental gap.
export function zeroBarReason(omas: OmaLike[]): string | null {
  if (omas.length === 0) return "Targets or progress not complete."
  if (hasOmasWithNoTargets(omas)) return "Targets not yet set."
  if (hasNoRecordedProgress(omas)) return "No progress recorded yet."
  return null
}
