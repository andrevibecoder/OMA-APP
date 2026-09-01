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
  // Always list every business unit, even with no OMAs set yet this period
  // (0%) — the framework has to stay clickable so people can start from zero.
  return bus.map((bu) => ({
    id: bu.id,
    name: bu.name,
    pct: buProgress(bu.users.map((u) => ({ omas: u.omas }))),
  }))
}

// Same shape as getCompanyDashboard, but every department's people are
// listed out (not just rolled up) — the "who's in which department" view.
export async function getPeopleDashboard(periodId: string) {
  const bus = await db.businessUnit.findMany({
    orderBy: { order: "asc" },
    include: {
      users: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: { omas: { where: { periodId }, include: { metrics: { select: { direction: true, target: true, current: true } } } } },
      },
    },
  })
  return bus.map((bu) => ({
    id: bu.id,
    name: bu.name,
    people: bu.users.map((u) => ({ id: u.id, name: u.name, pct: personProgress(u.omas) })),
  }))
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
    // Every active person in the BU, even with no OMAs set yet this period
    // (0%) — the framework has to stay clickable so people can start from zero.
    people: bu.users.map((u) => ({ id: u.id, name: u.name, pct: personProgress(u.omas) })),
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
        include: {
          metrics: {
            orderBy: { order: "asc" },
            select: { measure: true, unit: true, direction: true, target: true, current: true },
          },
        },
      },
    },
  })
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    businessUnit: user.businessUnit,
    // Metrics come along so the OMA list can show a KPI snapshot (measure /
    // target / current), not just the rolled-up percentage.
    omas: user.omas.map((o) => ({
      id: o.id,
      sequence: o.sequence,
      pct: omaProgress(o),
      outcome: o.outcome,
      metrics: o.metrics,
    })),
  }
}

export async function getOma(omaId: string) {
  const oma = await db.oMA.findUnique({
    where: { id: omaId },
    include: {
      owner: {
        select: { id: true, name: true, managerId: true, businessUnit: { select: { id: true, name: true } } },
      },
      period: { select: { id: true, label: true, shortLabel: true, startDate: true } },
      metrics: { orderBy: { order: "asc" } },
      actions: { orderBy: { order: "asc" } },
    },
  })
  if (!oma) return null
  return { ...oma, pct: omaProgress(oma) }
}
