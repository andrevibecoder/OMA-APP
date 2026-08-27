import { notFound, redirect } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { OmaEditForm } from "@/components/OmaEditForm"
import { getOma } from "@/lib/queries"
import { getSessionUser } from "@/lib/session"
import { canEditActions, canEditOutcomeMetric, canEditOma } from "@/lib/authz"

export default async function OmaEditPage({
  params,
  searchParams,
}: {
  params: { omaId: string }
  searchParams: { period?: string }
}) {
  const oma = await getOma(params.omaId)
  if (!oma) notFound()
  const viewer = await getSessionUser()
  const authShape = { ownerId: oma.owner.id, owner: { managerId: oma.owner.managerId } }
  if (!canEditOma(viewer, authShape)) redirect(`/oma/${oma.id}`)
  const qp = searchParams.period ? `?period=${searchParams.period}` : ""

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <Breadcrumbs
        items={[
          ...(oma.owner.businessUnit
            ? [{ label: oma.owner.businessUnit.name, href: `/bu/${oma.owner.businessUnit.id}${qp}` }]
            : []),
          { label: oma.owner.name, href: `/person/${oma.owner.id}${qp}` },
          { label: `OMA ${oma.sequence}`, href: `/oma/${oma.id}${qp}` },
          { label: "Edit" },
        ]}
      />
      <div className="mb-8 mt-3">
        <PageTitle>OMA {oma.sequence} — edit</PageTitle>
      </div>
      <OmaEditForm
        oma={{
          id: oma.id,
          sequence: oma.sequence,
          outcome: oma.outcome,
          period: { label: oma.period.label, startDate: oma.period.startDate.toISOString() },
          metrics: oma.metrics.map((m) => ({ measure: m.measure, target: m.target })),
          actions: oma.actions.map((a) => ({
            id: a.id,
            description: a.description,
            dueDate: a.dueDate ? a.dueDate.toISOString().slice(0, 10) : null,
            completed: a.completed,
          })),
        }}
        canOutcomeMetric={canEditOutcomeMetric(viewer, authShape)}
        canActions={canEditActions(viewer, authShape)}
      />
    </main>
  )
}
