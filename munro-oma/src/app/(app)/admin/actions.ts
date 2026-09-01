"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/admin"

type Result = { error?: string }

function isDup(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
}

// Active period + BU names feed the header and every dashboard, so bust the
// whole app on changes that touch them.
function revalidateApp() {
  revalidatePath("/admin")
  revalidatePath("/", "layout")
}

/** True when userId is the only active admin — used to block the console from
 *  locking everyone out. */
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  })
  return admins.length === 1 && admins[0].id === userId
}

// --------------------------------------------------------------------------
// Business Units
// --------------------------------------------------------------------------

const nameSchema = z.string().trim().min(1, "Name is required").max(60)

export async function createBusinessUnit(name: string): Promise<Result> {
  await requireAdmin()
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const last = await db.businessUnit.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  })
  try {
    await db.businessUnit.create({ data: { name: parsed.data, order: (last?.order ?? -1) + 1 } })
  } catch (e) {
    if (isDup(e)) return { error: `"${parsed.data}" already exists.` }
    throw e
  }
  revalidateApp()
  return {}
}

export async function renameBusinessUnit(id: string, name: string): Promise<Result> {
  await requireAdmin()
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    await db.businessUnit.update({ where: { id }, data: { name: parsed.data } })
  } catch (e) {
    if (isDup(e)) return { error: `"${parsed.data}" already exists.` }
    throw e
  }
  revalidateApp()
  return {}
}

export async function deleteBusinessUnit(id: string): Promise<Result> {
  await requireAdmin()
  const bu = await db.businessUnit.findUnique({ where: { id }, select: { id: true } })
  if (!bu) return {}
  // Anyone in this business unit is unassigned (businessUnitId -> null), not
  // deleted with it — they just fall out of every department list until
  // reassigned.
  await db.$transaction([
    db.user.updateMany({ where: { businessUnitId: id }, data: { businessUnitId: null } }),
    db.businessUnit.delete({ where: { id } }),
  ])
  revalidateApp()
  return {}
}

export async function moveBusinessUnit(id: string, direction: "up" | "down"): Promise<Result> {
  await requireAdmin()
  const all = await db.businessUnit.findMany({
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  })
  const idx = all.findIndex((b) => b.id === id)
  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (idx === -1 || swapIdx < 0 || swapIdx >= all.length) return {}
  const a = all[idx]
  const b = all[swapIdx]
  await db.$transaction([
    db.businessUnit.update({ where: { id: a.id }, data: { order: b.order } }),
    db.businessUnit.update({ where: { id: b.id }, data: { order: a.order } }),
  ])
  revalidateApp()
  return {}
}

// --------------------------------------------------------------------------
// Periods
// --------------------------------------------------------------------------

const periodSchema = z.object({
  half: z.number().int().min(1).max(2),
  year: z.number().int().min(2000).max(2100),
  startDate: z.string().min(1),
})

export async function createPeriod(raw: z.infer<typeof periodSchema>): Promise<Result> {
  await requireAdmin()
  const parsed = periodSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const p = parsed.data
  const label = `H${p.half} ${p.year}`
  const shortLabel = `H${p.half}`

  try {
    await db.period.create({
      data: {
        label,
        shortLabel,
        kind: "HALF",
        year: p.year,
        startDate: new Date(p.startDate),
        isActive: false,
      },
    })
  } catch (e) {
    if (isDup(e)) return { error: `"${label}" already exists.` }
    throw e
  }
  revalidatePath("/admin")
  return {}
}

export async function setActivePeriod(id: string): Promise<Result> {
  await requireAdmin()
  await db.$transaction([
    db.period.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    db.period.update({ where: { id }, data: { isActive: true } }),
  ])
  revalidateApp()
  return {}
}

// --------------------------------------------------------------------------
// Users
// --------------------------------------------------------------------------

const roleSchema = z.enum(["ADMIN", "MANAGER", "USER"])

const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
  role: roleSchema,
  businessUnitId: z.string().nullable(),
  managerId: z.string().nullable(),
})

export async function createUser(raw: z.infer<typeof userCreateSchema>): Promise<Result> {
  await requireAdmin()
  const parsed = userCreateSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const u = parsed.data
  try {
    await db.user.create({
      data: {
        name: u.name,
        email: u.email.toLowerCase(),
        passwordHash: bcrypt.hashSync(u.password, 10),
        role: u.role,
        businessUnitId: u.businessUnitId || null,
        managerId: u.managerId || null,
      },
    })
  } catch (e) {
    if (isDup(e)) return { error: `${u.email} is already registered.` }
    throw e
  }
  revalidateApp()
  return {}
}

const userUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email"),
  role: roleSchema,
  businessUnitId: z.string().nullable(),
  managerId: z.string().nullable(),
})

export async function updateUser(
  id: string,
  raw: z.infer<typeof userUpdateSchema>,
): Promise<Result> {
  await requireAdmin()
  const parsed = userUpdateSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const u = parsed.data
  if (u.managerId === id) return { error: "A user can't be their own manager." }
  if (u.role !== "ADMIN" && (await isLastActiveAdmin(id))) {
    return { error: "This is the only admin — promote someone else first." }
  }
  try {
    await db.user.update({
      where: { id },
      data: {
        name: u.name,
        email: u.email.toLowerCase(),
        role: u.role,
        businessUnitId: u.businessUnitId || null,
        managerId: u.managerId || null,
      },
    })
  } catch (e) {
    if (isDup(e)) return { error: `${u.email} is already registered.` }
    throw e
  }
  revalidateApp()
  return {}
}

export async function setUserActive(id: string, active: boolean): Promise<Result> {
  const me = await requireAdmin()
  if (id === me.id && !active) return { error: "You can't deactivate your own account." }
  if (!active && (await isLastActiveAdmin(id))) {
    return { error: "This is the only admin — promote someone else first." }
  }
  await db.user.update({ where: { id }, data: { active } })
  revalidateApp()
  return {}
}

export async function resetUserPassword(id: string, password: string): Promise<Result> {
  await requireAdmin()
  const parsed = z.string().min(6, "Password must be at least 6 characters").max(100).safeParse(password)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  await db.user.update({ where: { id }, data: { passwordHash: bcrypt.hashSync(parsed.data, 10) } })
  revalidatePath("/admin")
  return {}
}

export async function deleteUser(id: string): Promise<Result> {
  const me = await requireAdmin()
  if (id === me.id) return { error: "You can't delete your own account." }
  if (await isLastActiveAdmin(id)) {
    return { error: "This is the only admin — promote someone else first." }
  }
  // Detach anyone who reports to this user, drop their OMAs (metrics + actions
  // cascade), then remove the account.
  await db.$transaction([
    db.user.updateMany({ where: { managerId: id }, data: { managerId: null } }),
    db.oMA.deleteMany({ where: { ownerId: id } }),
    db.user.delete({ where: { id } }),
  ])
  revalidateApp()
  return {}
}
