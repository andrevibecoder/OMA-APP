import type { OmaRating } from "@prisma/client"

export const RATING_VALUE: Record<OmaRating, 1 | 2 | 3> = {
  BELOW: 1,
  MEETS: 2,
  EXCEEDS: 3,
}

const RATING_LABEL: Record<OmaRating, string> = {
  BELOW: "Below Expectation",
  MEETS: "Meets Expectation",
  EXCEEDS: "Exceeds Expectation",
}

export function ratingNumber(r: OmaRating): 1 | 2 | 3 {
  return RATING_VALUE[r]
}

export function ratingLabel(r: OmaRating): string {
  return RATING_LABEL[r]
}

function mean1dp(nums: number[]): number {
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  return Math.round(avg * 10) / 10
}

export function finalScore(items: { rating: OmaRating | null }[]): number | null {
  if (items.length === 0) return null
  if (items.some((i) => i.rating === null)) return null
  return mean1dp(items.map((i) => RATING_VALUE[i.rating as OmaRating]))
}

export function runningAverage(items: { rating: OmaRating | null }[]): number | null {
  const rated = items.filter((i) => i.rating !== null)
  if (rated.length === 0) return null
  return mean1dp(rated.map((i) => RATING_VALUE[i.rating as OmaRating]))
}

export function canComplete(items: { rating: OmaRating | null }[]): boolean {
  return items.length > 0 && items.every((i) => i.rating !== null)
}
