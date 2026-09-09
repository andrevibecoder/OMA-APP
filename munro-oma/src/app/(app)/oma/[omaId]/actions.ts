"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA, canEditActions, canEditOma, canEditOutcomeMetric } from "@/lib/authz"
import { omaSaveBlockers } from "@/lib/omaValidation"
import { buildCopiedOmaData } from "@/lib/omaCopy"
import { saveOmaSchema, type SaveOmaInput } from "@/types"

export async function tickAction(actionId: string, completed: boolean): Promise<void> {
  const viewer = await getSessionUser()
  const action = await db.action.findUniqueOrThrow({
    where: { id: actionId },
    include: {
      oma: {
        select: {
          id: true,
          ownerId: true,
          createdById: true,
          owner: { select: { managerId: true, businessUnitId: true } },
          period: { select: { locked: true } },
        },
      },
    },
  })
  const canTick = canEditActions(viewer, {
    ownerId: action.oma.ownerId,
    owner: action.oma.owner,
    periodLocked: action.oma.period.locked,
    createdById: action.oma.createdById,
  })
  if (!canTick) {
    throw new Error("Not allowed")
  }
  // Preserve an existing completion timestamp; only stamp fresh on a false -> true transition.
  const completedAt = completed
    ? action.completed && action.completedAt
      ? action.completedAt
      : new Date()
    : null
  await withDbRetry(() =>
    db.action.update({
      where: { id: actionId },
      data: { completed, completedAt },
    }),
  )
  revalidatePath(`/oma/${action.oma.id}`)
  revalidatePath(`/person/${action.oma.ownerId}`)
  if (action.oma.owner.businessUnitId) revalidatePath(`/bu/${action.oma.owner.businessUnitId}`)
  revalidatePath("/")
}

export async function saveOma(input: SaveOmaInput): Promise<void> {
  const data = saveOmaSchema.parse(input)
  const viewer = await getSessionUser()
  const oma = await db.oMA.findUniqueOrThrow({
    where: { id: data.omaId },
    include: {
      owner: { select: { id: true, managerId: true, businessUnitId: true } },
      actions: { select: { id: true, completed: true, completedAt: true } },
      period: { select: { locked: true } },
    },
  })
  const authShape = {
    ownerId: oma.owner.id,
    owner: { managerId: oma.owner.managerId },
    periodLocked: oma.period.locked,
    createdById: oma.createdById,
  }
  const mayOutcome = canEditOutcomeMetric(viewer, authShape)
  const mayActions = canEditActions(viewer, authShape)
  if (!mayOutcome && !mayActions) throw new Error("Not allowed")

  // Collect every write into one batch-array transaction: a single wrapped round trip
  // that works with the Supabase transaction pooler and cannot half-apply.
  const ops: Prisma.PrismaPromise<unknown>[] = []

  if (mayOutcome) {
    // Refuse to persist a half-done OMA: an OMA saved with no outcome or no
    // usable metric shows as 0% / "No metric set yet", which reads to the owner
    // as "my save didn't work". Only checked for someone who can edit the
    // Outcome/Metric — an actions-only editor can't fix this and isn't touching it.
    const blockers = omaSaveBlockers({
      title: data.title,
      outcome: data.outcome,
      metrics: data.metrics,
    })
    if (blockers.length) throw new Error(blockers.join(" "))

    // The OMA number can be re-sequenced within its period. An OMA never changes
    // period from here — that's the "Copy to period" action. Guard the slot
    // before the batch so the user gets a clear message, not a raw P2002.
    if (data.sequence !== oma.sequence) {
      const clash = await db.oMA.findFirst({
        where: {
          ownerId: oma.owner.id,
          periodId: oma.periodId,
          sequence: data.sequence,
          NOT: { id: oma.id },
        },
        select: { id: true },
      })
      if (clash) {
        throw new Error(`This person already has an OMA ${data.sequence} in that period.`)
      }
    }

    ops.push(
      db.oMA.update({
        where: { id: oma.id },
        data: {
          title: data.title,
          outcome: data.outcome,
          sequence: data.sequence,
        },
      }),
    )
    ops.push(db.metric.deleteMany({ where: { omaId: oma.id } }))
    // API-link fields (placeholder for a future live sync) are admin-only —
    // strip them for anyone else even if the request tried to send them.
    const isAdmin = viewer.role === "ADMIN"
    const metrics = data.metrics
      .filter((m) => m.measure.trim())
      .map((m, i) => ({
        omaId: oma.id,
        measure: m.measure,
        unit: m.unit,
        direction: m.direction,
        target: m.target,
        current: m.current,
        order: i,
        source: isAdmin ? m.source : "MANUAL",
        apiUrl: isAdmin && m.source === "API" ? m.apiUrl : null,
        apiPath: isAdmin && m.source === "API" ? m.apiPath : null,
        apiKey: isAdmin && m.source === "API" ? m.apiKey : null,
      }))
    if (metrics.length > 0) {
      ops.push(db.metric.createMany({ data: metrics }))
    }
  }

  if (mayActions) {
    const existing = new Map(oma.actions.map((a) => [a.id, a]))
    const keepIds = new Set(
      data.actions.filter((a) => a.id && existing.has(a.id)).map((a) => a.id as string),
    )
    const toDelete = oma.actions.filter((a) => !keepIds.has(a.id)).map((a) => a.id)
    if (toDelete.length) ops.push(db.action.deleteMany({ where: { id: { in: toDelete } } }))
    for (let i = 0; i < data.actions.length; i++) {
      const a = data.actions[i]
      const due = a.dueDate ? new Date(a.dueDate) : null
      // FR (26af6a4): ignore any action id that isn't one of this OMA's own actions.
      if (a.id && !existing.has(a.id)) continue
      if (a.id) {
        const prev = existing.get(a.id)!
        const completedAt = a.completed
          ? prev.completed && prev.completedAt
            ? prev.completedAt
            : new Date()
          : null
        ops.push(
          db.action.update({
            where: { id: a.id },
            data: {
              description: a.description,
              dueDate: due,
              completed: a.completed,
              completedAt,
              order: i,
            },
          }),
        )
      } else if (a.description.trim()) {
        ops.push(
          db.action.create({
            data: {
              omaId: oma.id,
              description: a.description,
              dueDate: due,
              completed: a.completed,
              completedAt: a.completed ? new Date() : null,
              order: i,
            },
          }),
        )
      }
    }
  }

  if (ops.length) await withDbRetry(() => db.$transaction(ops))

  revalidatePath(`/oma/${oma.id}`)
  revalidatePath(`/person/${oma.owner.id}`)
  if (oma.owner.businessUnitId) revalidatePath(`/bu/${oma.owner.businessUnitId}`)
  revalidatePath("/")
  redirect(`/oma/${oma.id}`)
}

// Carry an OMA over to another period: create a fresh OMA in the target period
// cloning everything as-is (KPI current values included; actions keep their
// completed state and completion dates). The original OMA is left untouched.
export async function copyOmaToPeriod(omaId: string, targetPeriodId: string): Promise<void> {
  const viewer = await getSessionUser()
  const source = await db.oMA.findUniqueOrThrow({
    where: { id: omaId },
    include: {
      owner: { select: { id: true, managerId: true, businessUnitId: true } },
      period: { select: { locked: true } },
      metrics: { orderBy: { order: "asc" } },
      actions: { orderBy: { order: "asc" } },
    },
  })

  const sourceAuth = {
    ownerId: source.owner.id,
    owner: { managerId: source.owner.managerId },
    periodLocked: source.period.locked,
    createdById: source.createdById,
  }
  if (!canEditOma(viewer, sourceAuth)) throw new Error("Not allowed")

  if (targetPeriodId === source.periodId) throw new Error("That OMA is already in this period.")

  const targetPeriod = await db.period.findUnique({
    where: { id: targetPeriodId },
    select: { id: true, startDate: true, locked: true },
  })
  if (!targetPeriod) throw new Error("That period no longer exists.")
  if (
    !canCreateOMA(
      viewer,
      { id: source.owner.id, managerId: source.owner.managerId },
      targetPeriod.locked,
    )
  ) {
    throw new Error("You can't add an OMA in that period.")
  }

  const last = await db.oMA.findFirst({
    where: { ownerId: source.owner.id, periodId: targetPeriod.id },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  })
  const data = buildCopiedOmaData(
    source,
    { periodId: targetPeriod.id, startDate: targetPeriod.startDate },
    (last?.sequence ?? 0) + 1,
    viewer.id,
  )

  let created
  try {
    created = await withDbRetry(() => db.oMA.create({ data }))
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Could not copy the OMA — please retry.")
    }
    throw e
  }

  revalidatePath(`/person/${source.owner.id}`)
  if (source.owner.businessUnitId) revalidatePath(`/bu/${source.owner.businessUnitId}`)
  revalidatePath("/")
  redirect(`/oma/${created.id}`)
}

export async function deleteOma(omaId: string): Promise<void> {
  const viewer = await getSessionUser()
  const oma = await db.oMA.findUniqueOrThrow({
    where: { id: omaId },
    select: {
      id: true,
      ownerId: true,
      createdById: true,
      periodId: true,
      owner: { select: { managerId: true, businessUnitId: true } },
      period: { select: { locked: true } },
    },
  })
  const authShape = {
    ownerId: oma.ownerId,
    owner: { managerId: oma.owner.managerId },
    periodLocked: oma.period.locked,
    createdById: oma.createdById,
  }
  if (!canEditOma(viewer, authShape)) throw new Error("Not allowed")

  const siblings = await db.oMA.findMany({
    where: { ownerId: oma.ownerId, periodId: oma.periodId, NOT: { id: oma.id } },
    orderBy: { sequence: "asc" },
    select: { id: true, sequence: true },
  })

  // Metrics and actions cascade with the OMA (schema onDelete: Cascade). Renumber
  // the remaining OMAs 1..n so the gap closes — processed ascending so a lower
  // target sequence is always vacated before a higher one needs it.
  const ops: Prisma.PrismaPromise<unknown>[] = [db.oMA.delete({ where: { id: omaId } })]
  siblings.forEach((s, i) => {
    const seq = i + 1
    if (s.sequence !== seq) ops.push(db.oMA.update({ where: { id: s.id }, data: { sequence: seq } }))
  })
  await withDbRetry(() => db.$transaction(ops))

  revalidatePath(`/person/${oma.ownerId}`)
  if (oma.owner.businessUnitId) revalidatePath(`/bu/${oma.owner.businessUnitId}`)
  revalidatePath("/")
  redirect(`/person/${oma.ownerId}`)
}
