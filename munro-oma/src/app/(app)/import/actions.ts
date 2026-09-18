"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"
import { getPeriodsWithDates } from "@/lib/periods"
import { extractFromPdf, ImportNotConfiguredError } from "@/lib/omaImport/extract"
import { toDraft, type DraftOma, type ImportDraft } from "@/lib/omaImport/toDraft"
import { draftOmaBlockers, buildCreatePayload } from "@/lib/omaImport/createFromDraft"

const draftOmaInputSchema = z.object({
  title: z.string().max(200),
  outcome: z.string().max(2000),
  metrics: z
    .array(
      z.object({
        measure: z.string().max(200),
        unit: z.enum(["NUMBER", "CURRENCY", "PERCENT", "DAYS"]),
        direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
        target: z.number().finite(),
        current: z.number().finite(),
        targetText: z.string().max(2000),
      }),
    )
    .max(10),
  actions: z
    .array(
      z.object({
        description: z.string().max(500),
        dueDate: z.string().nullable(),
        completed: z.boolean(),
        statusText: z.string().max(500),
      }),
    )
    .max(50),
})

const MAX_PDF_BYTES = 10 * 1024 * 1024

export async function parsePdf(formData: FormData): Promise<ImportDraft | { error: string }> {
  await getSessionUser() // any signed-in user may attempt a parse; canCreateOMA gates the actual create

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF to import." }
  if (file.type !== "application/pdf") return { error: "Only PDF files can be imported." }
  if (file.size > MAX_PDF_BYTES) return { error: "That PDF is too large (max 10 MB)." }

  const buffer = Buffer.from(await file.arrayBuffer())
  const pdfBase64 = buffer.toString("base64")

  let extracted
  try {
    extracted = await extractFromPdf(pdfBase64, file.name)
  } catch (e) {
    if (e instanceof ImportNotConfiguredError) {
      return { error: "AI import isn't configured on this environment." }
    }
    console.error("[oma-import] extraction failed:", e)
    return { error: e instanceof Error ? e.message : "Couldn't read that PDF. Please try again." }
  }

  const periods = await getPeriodsWithDates()
  return toDraft(extracted, periods, file.name)
}

export async function createImportedOmas(
  subjectId: string,
  periodId: string,
  omas: DraftOma[],
): Promise<{ error: string } | void> {
  const viewer = await getSessionUser()

  let parsedOmas: DraftOma[]
  try {
    parsedOmas = z.array(draftOmaInputSchema).parse(omas)
  } catch (e) {
    if (e instanceof z.ZodError) {
      const issue = e.issues[0]
      const omaIndex = typeof issue.path[0] === "number" ? issue.path[0] + 1 : "?"
      const field = issue.path.slice(1).join(".") || "field"
      return { error: `OMA ${omaIndex}: ${field} — ${issue.message}` }
    }
    throw e
  }
  const subject = await db.user.findUniqueOrThrow({
    where: { id: subjectId },
    select: { id: true, managerId: true, businessUnitId: true },
  })
  const period = await db.period.findUniqueOrThrow({
    where: { id: periodId },
    select: { startDate: true, endDate: true, locked: true },
  })
  if (!canCreateOMA(viewer, subject, period.locked)) return { error: "Not allowed" }
  if (parsedOmas.length === 0) return { error: "Nothing to import." }

  for (let i = 0; i < parsedOmas.length; i++) {
    const blockers = draftOmaBlockers(parsedOmas[i])
    if (blockers.length) return { error: `OMA ${i + 1}: ${blockers.join(" ")}` }
  }

  const last = await db.oMA.findFirst({
    where: { ownerId: subjectId, periodId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  })
  const nextSeq = (last?.sequence ?? 0) + 1

  try {
    await withDbRetry(() =>
      db.$transaction(
        parsedOmas.map((oma, i) =>
          db.oMA.create({
            data: buildCreatePayload(oma, subjectId, viewer.id, periodId, nextSeq + i, period.startDate, period.endDate),
          }),
        ),
      ),
    )
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Could not create the OMAs — please retry." }
    }
    throw e
  }

  revalidatePath(`/person/${subjectId}`)
  if (subject.businessUnitId) revalidatePath(`/bu/${subject.businessUnitId}`)
  revalidatePath("/")
  redirect(`/person/${subjectId}`)
}
