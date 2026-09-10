// Which subjects still need a review created for a period. Pure — the DB queries
// for eligibility and for existing reviews live in the batchOpen action.
export function subjectsToOpen(
  eligibleSubjectIds: string[],
  existingReviewSubjectIds: string[],
): string[] {
  const have = new Set(existingReviewSubjectIds)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of eligibleSubjectIds) {
    if (have.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
