import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"
import { listPeriods } from "@/lib/periods"
import { ImportReview } from "@/components/ImportReview"
import { PageTitle } from "@/components/PageTitle"
import { BackButton } from "@/components/BackButton"

export const maxDuration = 300

export default async function ImportPage({
  searchParams,
}: {
  searchParams: { subject?: string; period?: string }
}) {
  const viewer = await getSessionUser()

  const candidates = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, managerId: true },
    orderBy: { name: "asc" },
  })
  const periods = await listPeriods()

  // Period-lock is re-checked against the actual chosen period at create time
  // (createImportedOmas) — this filter only needs to know who the viewer may
  // ever import for, so periodLocked: false here.
  const importable = candidates.filter((c) => canCreateOMA(viewer, c, false))
  if (importable.length === 0) redirect("/")

  const defaultSubjectId =
    searchParams.subject && importable.some((c) => c.id === searchParams.subject)
      ? searchParams.subject
      : viewer.id
  const qp = searchParams.period ? `?period=${searchParams.period}` : ""

  return (
    <main>
      <BackButton href={`/person/${defaultSubjectId}${qp}`} />
      <div className="mt-3">
        <PageTitle>Import OMAs from a PDF</PageTitle>
      </div>
      <div className="mt-10">
        <ImportReview
          subjects={importable.map((c) => ({ id: c.id, name: c.name }))}
          periods={periods}
          defaultSubjectId={defaultSubjectId}
          defaultPeriodId={searchParams.period ?? null}
          hasApiKey={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      </div>
    </main>
  )
}
