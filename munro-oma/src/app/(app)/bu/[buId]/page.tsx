import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { BackButton } from "@/components/BackButton"
import { RagBar } from "@/components/RagBar"
import { getBusinessUnit } from "@/lib/queries"
import { db } from "@/lib/db"
import { resolvePeriodId } from "@/lib/periods"

export default async function BuPage({
  params,
  searchParams,
}: {
  params: { buId: string }
  searchParams: { period?: string }
}) {
  const periodId = await resolvePeriodId(searchParams.period)
  const period = await db.period.findUniqueOrThrow({ where: { id: periodId } })
  const bu = await getBusinessUnit(params.buId, periodId)
  if (!bu) notFound()
  const qp = searchParams.period ? `?period=${periodId}` : ""

  return (
    <main>
      <BackButton />
      <Breadcrumbs
        items={[
          { label: "Main dashboard", href: `/${qp}` },
          { label: bu.name },
          { label: period.shortLabel },
        ]}
      />
      <div className="mt-3">
        <PageTitle>{bu.name}</PageTitle>
      </div>
      <div className="mt-10">
        {bu.people.map((p) => (
          <RagBar key={p.id} label={p.name} value={p.pct} href={`/person/${p.id}${qp}`} />
        ))}
      </div>
    </main>
  )
}
