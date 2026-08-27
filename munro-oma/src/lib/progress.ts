import type { RagState } from "@/types"

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

type ActionLike = { completed: boolean }
type OmaLike = { actions: ActionLike[] }

export function omaProgress(oma: OmaLike): number {
  const total = oma.actions.length
  if (total === 0) return 0
  const completed = oma.actions.filter((a) => a.completed).length
  return Math.round((completed / total) * 100)
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
