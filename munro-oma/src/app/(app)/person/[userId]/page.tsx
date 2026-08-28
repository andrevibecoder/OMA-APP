import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { BackButton } from "@/components/BackButton"
import { RagBar } from "@/components/RagBar"
import { getPerson } from "@/lib/queries"
import { db } from "@/lib/db"
import { resolvePeriodId } from "@/lib/periods"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"
import { createOma } from "./actions"

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: { userId: string }
  searchParams: { period?: string }
}) {
  const periodId = await resolvePeriodId(searchParams.period)
  const period = await db.period.findUniqueOrThrow({ where: { id: periodId } })
  const person = await getPerson(params.userId, periodId)
  if (!person) notFound()
  const viewer = await getSessionUser()
  const target = await db.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { id: true, managerId: true },
  })
  const canAdd = canCreateOMA(viewer, target, person.omas.length)
  const qp = searchParams.period ? `?period=${periodId}` : ""

  return (
    <main>
      <BackButton />
      <Breadcrumbs
        items={[
          ...(person.businessUnit
            ? [{ label: person.businessUnit.name, href: `/bu/${person.businessUnit.id}${qp}` }]
            : []),
          { label: person.name },
          { label: period.shortLabel },
        ]}
      />
      <div className="mt-3 flex items-baseline justify-between">
        <PageTitle>{person.name} — OMAs</PageTitle>
        {canAdd && (
          <form action={createOma.bind(null, person.id, periodId)}>
            <button className="rounded-full bg-mfa-red px-4 py-1.5 text-sm font-semibold text-white">
              New OMA
            </button>
          </form>
        )}
      </div>
      <div className="mt-10">
        {person.omas.map((o) => (
          <RagBar key={o.id} label={`OMA ${o.sequence}`} value={o.pct} href={`/oma/${o.id}${qp}`} />
        ))}
        {person.omas.length === 0 && (
          <p className="text-sm text-mfa-muted">No OMAs set for this period yet.</p>
        )}
      </div>
      <p className="mt-12 text-sm text-mfa-muted">
        Three OMAs is the cap — it keeps the review conversation short and honest.
      </p>
    </main>
  )
}
