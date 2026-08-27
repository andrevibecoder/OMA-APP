import { db } from "@/lib/db"
import { buProgress, omaProgress, personProgress } from "@/lib/progress"

export async function getCompanyDashboard(periodId: string) {
  const bus = await db.businessUnit.findMany({
    orderBy: { order: "asc" },
    include: {
      users: {
        where: { active: true },
        include: { omas: { where: { periodId }, include: { metrics: { select: { direction: true, target: true, current: true } } } } },
      },
    },
  })
  return bus
    .map((bu) => ({
      id: bu.id,
      name: bu.name,
      hasOmas: bu.users.some((u) => u.omas.length > 0),
      pct: buProgress(bu.users.map((u) => ({ omas: u.omas }))),
    }))
    .filter((b) => b.hasOmas)
    .map(({ id, name, pct }) => ({ id, name, pct }))
}

export async function getBusinessUnit(buId: string, periodId: string) {
  const bu = await db.businessUnit.findUnique({
    where: { id: buId },
    include: {
      users: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: { omas: { where: { periodId }, include: { metrics: { select: { direction: true, target: true, current: true } } } } },
      },
    },
  })
  if (!bu) return null
  return {
    name: bu.name,
    // Only people with >=1 OMA this period — the same population buProgress averages on
    // Screen 1, so the visible rows here mean out to the BU bar there.
    people: bu.users
      .filter((u) => u.omas.length > 0)
      .map((u) => ({ id: u.id, name: u.name, pct: personProgress(u.omas) })),
  }
}

export async function getPerson(userId: string, periodId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      businessUnit: { select: { id: true, name: true } },
      omas: {
        where: { periodId },
        orderBy: { sequence: "asc" },
        include: { metrics: { select: { direction: true, target: true, current: true } } },
      },
    },
  })
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    businessUnit: user.businessUnit,
    omas: user.omas.map((o) => ({ id: o.id, sequence: o.sequence, pct: omaProgress(o) })),
  }
}

export async function getOma(omaId: string) {
  const oma = await db.oMA.findUnique({
    where: { id: omaId },
    include: {
      owner: {
        select: { id: true, name: true, managerId: true, businessUnit: { select: { id: true, name: true } } },
      },
      period: { select: { id: true, label: true, quarter: true, startDate: true } },
      metrics: { orderBy: { order: "asc" } },
      actions: { orderBy: { order: "asc" } },
    },
  })
  if (!oma) return null
  return { ...oma, pct: omaProgress(oma) }
}
