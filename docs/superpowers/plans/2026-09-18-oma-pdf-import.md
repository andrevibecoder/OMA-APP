# OMA PDF Import (AI-assisted) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager/admin upload a Word→PDF OMA document on a person's page, have Claude draft the OMAs (outcome + KPIs + actions, with compound target cells split into separate trackable KPI rows), review/edit every field, then create them all in one go instead of retyping.

**Architecture:** One new isolated module (`src/lib/omaImport/`) beside the existing OMA code — a single Anthropic Messages API call (PDF sent as a base64 `document` block, response constrained to a Zod schema via `output_config.format`) produces a structured draft; two pure functions (`toDraft`, `createFromDraft`) normalize and validate it using the *existing* `omaSaveBlockers` rule; a new `/import` route (Server Component + one client component holding upload→review state) lets the user fix everything before `createImportedOmas` writes it in a transaction, mirroring the existing `createOma`/`copyOmaToPeriod` server actions exactly. Nothing is persisted until "Create."

**Tech Stack:** Next.js 14.2.15 (App Router, Server Actions), React 18.3.1, TypeScript 5.6.3, Prisma 5.22.0, Zod 3.23.8, Vitest 2.1.3, `@anthropic-ai/sdk` (new dependency), Tailwind 3.4.14.

**Spec:** `docs/superpowers/specs/2026-09-10-oma-pdf-import-design.md` (all 13 decisions D1–D13 resolved; this plan implements it as written).

## Global Constraints

- Metrics per OMA: max 10 (existing `saveOmaSchema` cap — `draftOmaBlockers` must enforce the same cap for imports).
- Actions per OMA: max 50 (same).
- Uploaded PDF: `application/pdf` only, max 10 MB, rejected before any API call.
- Model: `claude-opus-5`, fixed (D11) — not swappable for cost.
- Imported metrics are always `source: "MANUAL"` — import never sets the API-link fields.
- Nothing is persisted until "Create all" — no PDF stored, no import-history row, no schema change (D9).
- Imported OMAs are always **appended** at the next free sequence numbers — never merged with or overwriting existing OMAs (D10).
- Entry point is a button on the person page beside "+ Add OMA" (D13) — no top-nav link.

---

## Task 1: Add the Anthropic SDK dependency and API key config

**Files:**
- Modify: `munro-oma/package.json` (via `npm install`, not hand-edited)
- Modify: `munro-oma/.env.example`
- Modify: `munro-oma/.env` (local only — not committed; user already has a key, see plan prerequisites)

No test — this is pure dependency/config setup with no behavior of its own; it unblocks every later task.

- [ ] **Step 1: Install the SDK**

Run from `munro-oma/`:

```bash
npm install @anthropic-ai/sdk
```

This adds `@anthropic-ai/sdk` to `dependencies` in `package.json` and updates `package-lock.json` — let npm resolve the version; do not hand-pin a version number.

- [ ] **Step 2: Document the env var in `.env.example`**

Add to the end of `munro-oma/.env.example`:

```
# Anthropic API key — used only by the OMA PDF import feature (/import).
# https://console.anthropic.com/settings/keys
# ANTHROPIC_API_KEY="sk-ant-..."
```

- [ ] **Step 3: Add the real key to local `.env`**

Add `ANTHROPIC_API_KEY="<the user's key>"` to `munro-oma/.env` (gitignored — confirm `.env` is in `.gitignore` before saving anything here; it already is per the existing `DATABASE_URL`/`AUTH_SECRET` entries living there). Also add the same var to Vercel's project env for production before Task 11's manual checks are repeated there.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add @anthropic-ai/sdk for OMA PDF import"
```

(`.env` is never committed.)

---

## Task 2: `schema.ts` — the extraction contract's types

**Files:**
- Create: `munro-oma/src/lib/omaImport/schema.ts`
- Test: `munro-oma/tests/omaImport/schema.test.ts`

**Interfaces:**
- Produces: `extractedImportSchema` (Zod), `ExtractedImport`, `ExtractedOma`, `ExtractedKpi`, `ExtractedAction` (types) — consumed by Task 6 (`extract.ts`) and Task 4 (`toDraft.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// munro-oma/tests/omaImport/schema.test.ts
import { describe, expect, it } from "vitest"
import { extractedImportSchema } from "@/lib/omaImport/schema"

const validKpi = {
  measure: "Revenue",
  unit: "CURRENCY",
  direction: "HIGHER_BETTER",
  target: 3_000_000,
  targetText: "R3 million",
}

const validOma = {
  title: "Grow revenue",
  outcome: "Grow revenue this year",
  kpis: [validKpi],
  actions: [
    { description: "Launch campaign", dueDate: "2027-01-01", completed: false, statusText: "In progress" },
  ],
}

const validImport = {
  subjectName: "Sharine Potgieter",
  periodStart: "2026-09-01",
  periodEnd: "2027-02-28",
  omas: [validOma],
  warnings: [],
}

describe("extractedImportSchema", () => {
  it("accepts a fully-populated valid shape", () => {
    expect(extractedImportSchema.safeParse(validImport).success).toBe(true)
  })

  it("accepts null for subjectName, periodStart, periodEnd", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        subjectName: null,
        periodStart: null,
        periodEnd: null,
      }).success,
    ).toBe(true)
  })

  it("accepts null unit, direction and target on a KPI", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        omas: [{ ...validOma, kpis: [{ ...validKpi, unit: null, direction: null, target: null }] }],
      }).success,
    ).toBe(true)
  })

  it("rejects a missing omas field", () => {
    const { omas: _omas, ...withoutOmas } = validImport
    expect(extractedImportSchema.safeParse(withoutOmas).success).toBe(false)
  })

  it("rejects a target given as a string instead of a number", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        omas: [{ ...validOma, kpis: [{ ...validKpi, target: "3000000" }] }],
      }).success,
    ).toBe(false)
  })

  it("rejects an unrecognised unit value", () => {
    expect(
      extractedImportSchema.safeParse({
        ...validImport,
        omas: [{ ...validOma, kpis: [{ ...validKpi, unit: "WEIGHT" }] }],
      }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/omaImport/schema'`

- [ ] **Step 3: Write the implementation**

```ts
// munro-oma/src/lib/omaImport/schema.ts
//
// Imports from "zod/v4" (the v4 API surface shipped inside the installed
// zod@3.25.8 package as a coexistence subpath), NOT the classic top-level
// "zod" import used everywhere else in this codebase (src/types.ts's
// saveOmaSchema, auth.ts, etc.). Corrected 2026-09-18 during Task 6: the
// installed @anthropic-ai/sdk's zodOutputFormat() helper hard-requires
// "zod/v4" internally and calls its z.toJSONSchema(), which only
// introspects schemas built via the v4 z.object(...) (v4's internal
// `_zod.def` shape) — passing it a classic v3 schema throws
// "Cannot read properties of undefined (reading 'def')" both at runtime
// and in typecheck. Verified: zod/v4's object/string/number/enum/
// nullable/array API is otherwise identical for this file's purposes, so
// this is a one-line import change, not a schema rewrite. Scoped to this
// file only — saveOmaSchema and the rest of the app's zod usage stay on
// classic "zod" (untouched, unrelated to Anthropic's structured-output
// feature).
import { z } from "zod/v4"

export const extractedKpiSchema = z.object({
  measure: z.string(),
  // .meta({ type: "string" }) is load-bearing, not decorative: zod/v4's
  // z.enum() emits JSON Schema as bare { enum: [...] } with no "type" key,
  // which @anthropic-ai/sdk's zodOutputFormat() transform rejects ("JSON
  // schema must have a type defined..."). The .meta() call merges { type:
  // "string" } onto the generated schema node without changing runtime
  // validation. Discovered and verified during Task 6 (932c8d5's fix
  // resolved the v3/v4 shape mismatch but not this separate enum-specific
  // JSON-Schema-generation gap).
  unit: z.enum(["NUMBER", "CURRENCY", "PERCENT", "DAYS"]).meta({ type: "string" }).nullable(),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]).meta({ type: "string" }).nullable(),
  // 3_000_000 from "R3 million"; null from "[TBC]" or pure narrative.
  target: z.number().nullable(),
  // The original target prose — always kept, shown on the review page.
  targetText: z.string(),
})

export const extractedActionSchema = z.object({
  description: z.string(),
  // ISO date only when a real calendar date is present; else null.
  dueDate: z.string().nullable(),
  completed: z.boolean(),
  // "Ongoing" / "In progress (Inani)" — the original status text, verbatim.
  statusText: z.string(),
})

export const extractedOmaSchema = z.object({
  // Short label derived from the outcome heading.
  title: z.string(),
  // The outcome paragraph, verbatim — never summarised.
  outcome: z.string(),
  kpis: z.array(extractedKpiSchema),
  actions: z.array(extractedActionSchema),
})

export const extractedImportSchema = z.object({
  // A hint from the document header — the importer confirms the real subject.
  subjectName: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  omas: z.array(extractedOmaSchema),
  warnings: z.array(z.string()),
})

export type ExtractedKpi = z.infer<typeof extractedKpiSchema>
export type ExtractedAction = z.infer<typeof extractedActionSchema>
export type ExtractedOma = z.infer<typeof extractedOmaSchema>
export type ExtractedImport = z.infer<typeof extractedImportSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- schema.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/omaImport/schema.ts tests/omaImport/schema.test.ts
git commit -m "feat: add OMA PDF import extraction schema"
```

---

## Task 3: `getPeriodsWithDates()` — period-overlap data helper

**Files:**
- Modify: `munro-oma/src/lib/periods.ts`

No test — this is a two-line Prisma read with no branching, matching the untested `listPeriods`/`resolvePeriodId` already in this file (both DB reads, no dedicated test file exists for `periods.ts`).

**Interfaces:**
- Produces: `PeriodLite = { id: string; startDate: Date; endDate: Date | null }`, `getPeriodsWithDates(): Promise<PeriodLite[]>` — consumed by Task 7 (`actions.ts`), whose result feeds Task 4's `toDraft`.

- [ ] **Step 1: Add the helper**

Add to `munro-oma/src/lib/periods.ts` (after `listPeriods`, before `resolvePeriodId`):

```ts
export type PeriodLite = { id: string; startDate: Date; endDate: Date | null }

// Full date range per period — unlike listPeriods (which strips dates after
// sorting), this is for period-overlap matching (OMA PDF import, D7).
export async function getPeriodsWithDates(): Promise<PeriodLite[]> {
  return db.period.findMany({ select: { id: true, startDate: true, endDate: true } })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/periods.ts
git commit -m "feat: add getPeriodsWithDates for OMA import period matching"
```

---

## Task 4: `toDraft.ts` — pure normalisation (TDD)

**Files:**
- Create: `munro-oma/src/lib/omaImport/toDraft.ts`
- Test: `munro-oma/tests/omaImport/toDraft.test.ts`

**Interfaces:**
- Consumes: `ExtractedImport`, `ExtractedOma` (Task 2); `PeriodLite` (Task 3, redeclared locally here to keep this module dependency-free of `periods.ts` — see note in Step 3).
- Produces: `ImportDraft`, `DraftOma`, `DraftMetric`, `DraftAction` (types), `toDraft(x: ExtractedImport, periods: PeriodLite[], filename: string): ImportDraft` — consumed by Task 7 (`actions.ts`) and Task 5 (`createFromDraft.ts`, via `DraftOma`).

Note on scope: the AI (Task 6's prompt) does the text-to-number work ("R3 million" → 3000000) — `toDraft` never parses prose. Its only responsibilities are period-overlap matching, defaulting `null` fields to concrete values, and warning dedup, all fixture-driven (the fixtures below simulate what extraction already resolved).

- [ ] **Step 1: Write the failing tests**

```ts
// munro-oma/tests/omaImport/toDraft.test.ts
import { describe, expect, it } from "vitest"
import { toDraft, type PeriodLite } from "@/lib/omaImport/toDraft"
import type { ExtractedImport, ExtractedOma } from "@/lib/omaImport/schema"

const period2026H2: PeriodLite = {
  id: "h2-2026",
  startDate: new Date("2026-09-01"),
  endDate: new Date("2027-02-28"),
}
const period2027H1: PeriodLite = {
  id: "h1-2027",
  startDate: new Date("2027-01-01"),
  endDate: new Date("2027-06-30"),
}

const baseOma: ExtractedOma = {
  title: "Grow revenue",
  outcome: "Grow revenue this year",
  kpis: [
    {
      measure: "Revenue",
      unit: "CURRENCY",
      direction: "HIGHER_BETTER",
      target: 3_000_000,
      targetText: "R3 million",
    },
  ],
  actions: [
    { description: "Launch campaign", dueDate: "2027-01-01", completed: false, statusText: "In progress" },
  ],
}

function extracted(overrides: Partial<ExtractedImport> = {}): ExtractedImport {
  return {
    subjectName: "Sharine Potgieter",
    periodStart: "2026-09-01",
    periodEnd: "2027-02-28",
    omas: [baseOma],
    warnings: [],
    ...overrides,
  }
}

describe("toDraft", () => {
  it("picks the period with the largest date overlap", () => {
    const draft = toDraft(extracted(), [period2027H1, period2026H2], "test.pdf")
    expect(draft.periodId).toBe("h2-2026")
  })

  it("returns periodId null with a warning when no period overlaps", () => {
    const draft = toDraft(
      extracted({ periodStart: "2030-01-01", periodEnd: "2030-06-30" }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.periodId).toBeNull()
    expect(draft.warnings).toContain("No existing period overlaps the document's dates — pick one.")
  })

  it("returns periodId null with a warning when the document has no period dates", () => {
    const draft = toDraft(extracted({ periodStart: null, periodEnd: null }), [period2026H2], "test.pdf")
    expect(draft.periodId).toBeNull()
    expect(draft.warnings).toContain("Couldn't read the period dates from the PDF — pick one.")
  })

  it("defaults a null unit to NUMBER", () => {
    const draft = toDraft(
      extracted({ omas: [{ ...baseOma, kpis: [{ ...baseOma.kpis[0], unit: null }] }] }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.omas[0].metrics[0].unit).toBe("NUMBER")
  })

  it("defaults a null direction to HIGHER_BETTER", () => {
    const draft = toDraft(
      extracted({ omas: [{ ...baseOma, kpis: [{ ...baseOma.kpis[0], direction: null }] }] }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.omas[0].metrics[0].direction).toBe("HIGHER_BETTER")
  })

  it("defaults a null target to 0", () => {
    const draft = toDraft(
      extracted({ omas: [{ ...baseOma, kpis: [{ ...baseOma.kpis[0], target: null }] }] }),
      [period2026H2],
      "test.pdf",
    )
    expect(draft.omas[0].metrics[0].target).toBe(0)
  })

  it("keeps targetText and statusText for the review page", () => {
    const draft = toDraft(extracted(), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics[0].targetText).toBe("R3 million")
    expect(draft.omas[0].actions[0].statusText).toBe("In progress")
  })

  it("dedupes warnings while keeping order", () => {
    const draft = toDraft(extracted({ warnings: ["a", "b", "a"] }), [period2026H2], "test.pdf")
    expect(draft.warnings).toEqual(["a", "b"])
  })

  it("carries the filename through and passes subjectName through unchanged (including null)", () => {
    const draft = toDraft(extracted({ subjectName: null }), [period2026H2], "test.pdf")
    expect(draft.filename).toBe("test.pdf")
    expect(draft.subjectName).toBeNull()
  })

  it("maps every kpi and action 1:1 into metrics and actions", () => {
    const twoKpiOma: ExtractedOma = {
      ...baseOma,
      kpis: [
        baseOma.kpis[0],
        { measure: "Cost per report", unit: "CURRENCY", direction: "LOWER_BETTER", target: 3500, targetText: "R3 500" },
      ],
    }
    const draft = toDraft(extracted({ omas: [twoKpiOma] }), [period2026H2], "test.pdf")
    expect(draft.omas[0].metrics).toHaveLength(2)
    expect(draft.omas[0].metrics[1].measure).toBe("Cost per report")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- toDraft.test.ts`
Expected: FAIL — `Cannot find module '@/lib/omaImport/toDraft'`

- [ ] **Step 3: Write the implementation**

```ts
// munro-oma/src/lib/omaImport/toDraft.ts
import type { MetricDirection, MetricUnit } from "@prisma/client"
import type { ExtractedImport, ExtractedOma } from "./schema"

// Redeclared here (not imported from periods.ts) so this pure module has no
// dependency on the DB-touching lib — the caller (actions.ts) supplies data
// shaped like this from getPeriodsWithDates().
export type PeriodLite = { id: string; startDate: Date; endDate: Date | null }

export type DraftMetric = {
  measure: string
  unit: MetricUnit
  direction: MetricDirection
  target: number
  targetText: string
}

export type DraftAction = {
  description: string
  dueDate: string | null
  completed: boolean
  statusText: string
}

export type DraftOma = {
  title: string
  outcome: string
  metrics: DraftMetric[]
  actions: DraftAction[]
}

export type ImportDraft = {
  subjectName: string | null
  periodId: string | null
  filename: string
  warnings: string[]
  omas: DraftOma[]
}

function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime())
  const end = Math.min(aEnd.getTime(), bEnd.getTime())
  return Math.max(0, end - start) / (1000 * 60 * 60 * 24)
}

function matchPeriod(
  periodStart: string | null,
  periodEnd: string | null,
  periods: PeriodLite[],
): { periodId: string | null; warning: string | null } {
  if (!periodStart || !periodEnd) {
    return { periodId: null, warning: "Couldn't read the period dates from the PDF — pick one." }
  }
  const docStart = new Date(periodStart)
  const docEnd = new Date(periodEnd)
  let best: { id: string; days: number } | null = null
  for (const p of periods) {
    const pEnd = p.endDate ?? p.startDate
    const days = overlapDays(docStart, docEnd, p.startDate, pEnd)
    if (days > 0 && (!best || days > best.days)) best = { id: p.id, days }
  }
  if (!best) {
    return { periodId: null, warning: "No existing period overlaps the document's dates — pick one." }
  }
  return { periodId: best.id, warning: null }
}

function toDraftOma(o: ExtractedOma): DraftOma {
  return {
    title: o.title,
    outcome: o.outcome,
    metrics: o.kpis.map((k) => ({
      measure: k.measure,
      unit: k.unit ?? "NUMBER",
      direction: k.direction ?? "HIGHER_BETTER",
      target: k.target ?? 0,
      targetText: k.targetText,
    })),
    actions: o.actions.map((a) => ({
      description: a.description,
      dueDate: a.dueDate,
      completed: a.completed,
      statusText: a.statusText,
    })),
  }
}

export function toDraft(x: ExtractedImport, periods: PeriodLite[], filename: string): ImportDraft {
  const { periodId, warning } = matchPeriod(x.periodStart, x.periodEnd, periods)
  const warnings = warning ? [...x.warnings, warning] : [...x.warnings]

  return {
    subjectName: x.subjectName,
    periodId,
    filename,
    warnings: [...new Set(warnings)], // dedupe, keep first-occurrence order
    omas: x.omas.map(toDraftOma),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- toDraft.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/omaImport/toDraft.ts tests/omaImport/toDraft.test.ts
git commit -m "feat: add pure OMA import normalisation (toDraft)"
```

---

## Task 5: `createFromDraft.ts` — validation + create-payload builder (TDD)

**Files:**
- Create: `munro-oma/src/lib/omaImport/createFromDraft.ts`
- Test: `munro-oma/tests/omaImport/createFromDraft.test.ts`

**Interfaces:**
- Consumes: `DraftOma` (Task 4); `omaSaveBlockers` (existing, `src/lib/omaValidation.ts`).
- Produces: `draftOmaBlockers(oma: DraftOma): string[]`, `buildCreatePayload(oma: DraftOma, ownerId: string, createdById: string, periodId: string, sequence: number, periodStartDate: Date, periodEndDate: Date | null)` — consumed by Task 7 (`actions.ts`) and Task 9 (`ImportReview.tsx`, client-side `draftOmaBlockers` only).

- [ ] **Step 1: Write the failing tests**

```ts
// munro-oma/tests/omaImport/createFromDraft.test.ts
import { describe, expect, it } from "vitest"
import { buildCreatePayload, draftOmaBlockers } from "@/lib/omaImport/createFromDraft"
import type { DraftOma } from "@/lib/omaImport/toDraft"

const okOma: DraftOma = {
  title: "Grow revenue",
  outcome: "Grow revenue this year",
  metrics: [
    { measure: "Revenue", unit: "CURRENCY", direction: "HIGHER_BETTER", target: 3_000_000, targetText: "R3 million" },
  ],
  actions: [
    { description: "Launch campaign", dueDate: "2027-01-01", completed: false, statusText: "In progress" },
  ],
}

describe("draftOmaBlockers", () => {
  it("returns no blockers for a complete OMA", () => {
    expect(draftOmaBlockers(okOma)).toEqual([])
  })

  it("blocks a blank title", () => {
    expect(draftOmaBlockers({ ...okOma, title: "" })).toContain("Add a title before saving.")
  })

  it("blocks a blank outcome", () => {
    expect(draftOmaBlockers({ ...okOma, outcome: "" })).toContain("Add an outcome before saving.")
  })

  it("blocks an OMA whose only metric has a null-defaulted (zero) target", () => {
    // The metric still has a measure ("Revenue"), so omaSaveBlockers treats this
    // as a partial row (named but not targeted), not a fully-empty one — it
    // reports "Every KPI needs both a name and a target.", not "Add at least
    // one KPI with a target." (that message is only for an all-blank metrics
    // list). Corrected 2026-09-18 — the plan originally had this backwards.
    expect(draftOmaBlockers({ ...okOma, metrics: [{ ...okOma.metrics[0], target: 0 }] })).toContain(
      "Every KPI needs both a name and a target.",
    )
  })

  it("blocks more than 10 KPI rows", () => {
    const manyMetrics = Array.from({ length: 11 }, (_, i) => ({ ...okOma.metrics[0], measure: `KPI ${i}` }))
    expect(draftOmaBlockers({ ...okOma, metrics: manyMetrics })).toContain(
      "Too many KPI rows (max 10) — merge or remove some before creating.",
    )
  })

  it("blocks more than 50 actions", () => {
    const manyActions = Array.from({ length: 51 }, (_, i) => ({ ...okOma.actions[0], description: `Action ${i}` }))
    expect(draftOmaBlockers({ ...okOma, actions: manyActions })).toContain(
      "Too many actions (max 50) — remove some before creating.",
    )
  })
})

describe("buildCreatePayload", () => {
  it("builds the nested create shape with the given owner/period/sequence", () => {
    const payload = buildCreatePayload(
      okOma,
      "user-1",
      "creator-1",
      "period-1",
      2,
      new Date("2026-09-01"),
      new Date("2027-02-28"),
    )
    expect(payload.ownerId).toBe("user-1")
    expect(payload.createdById).toBe("creator-1")
    expect(payload.periodId).toBe("period-1")
    expect(payload.sequence).toBe(2)
    expect(payload.metrics.create).toHaveLength(1)
    expect(payload.metrics.create[0]).toMatchObject({
      measure: "Revenue",
      target: 3_000_000,
      current: 0,
      order: 0,
      source: "MANUAL",
    })
    expect(payload.actions.create).toHaveLength(1)
    expect(payload.actions.create[0]).toMatchObject({
      description: "Launch campaign",
      completed: false,
      completedAt: null,
    })
  })

  it("drops a metric row with a blank measure", () => {
    const payload = buildCreatePayload(
      {
        ...okOma,
        metrics: [...okOma.metrics, { measure: "  ", unit: "NUMBER", direction: "HIGHER_BETTER", target: 5, targetText: "" }],
      },
      "u",
      "c",
      "p",
      1,
      new Date(),
      null,
    )
    expect(payload.metrics.create).toHaveLength(1)
  })

  it("drops an action row with a blank description", () => {
    const payload = buildCreatePayload(
      { ...okOma, actions: [...okOma.actions, { description: "  ", dueDate: null, completed: false, statusText: "" }] },
      "u",
      "c",
      "p",
      1,
      new Date(),
      null,
    )
    expect(payload.actions.create).toHaveLength(1)
  })

  it("stamps completedAt only for a completed action", () => {
    const payload = buildCreatePayload(
      { ...okOma, actions: [{ ...okOma.actions[0], completed: true }] },
      "u",
      "c",
      "p",
      1,
      new Date(),
      null,
    )
    expect(payload.actions.create[0].completedAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- createFromDraft.test.ts`
Expected: FAIL — `Cannot find module '@/lib/omaImport/createFromDraft'`

- [ ] **Step 3: Write the implementation**

```ts
// munro-oma/src/lib/omaImport/createFromDraft.ts
import { omaSaveBlockers } from "@/lib/omaValidation"
import type { DraftOma } from "./toDraft"

// Mirrors the caps in src/types.ts's saveOmaSchema (.max(10) metrics, .max(50)
// actions) — omaSaveBlockers doesn't itself enforce them (that's a Zod-only
// cap on the manual-save path), so an import must check them independently.
const MAX_METRICS = 10
const MAX_ACTIONS = 50

export function draftOmaBlockers(oma: DraftOma): string[] {
  const blockers = omaSaveBlockers({
    title: oma.title,
    outcome: oma.outcome,
    metrics: oma.metrics.map((m) => ({ measure: m.measure, target: m.target })),
  })
  if (oma.metrics.length > MAX_METRICS) {
    blockers.push(`Too many KPI rows (max ${MAX_METRICS}) — merge or remove some before creating.`)
  }
  if (oma.actions.length > MAX_ACTIONS) {
    blockers.push(`Too many actions (max ${MAX_ACTIONS}) — remove some before creating.`)
  }
  return blockers
}

// Mirrors buildCopiedOmaData's shape exactly (src/lib/omaCopy.ts) — a single
// db.oMA.create({ data }) payload with nested metric/action creates. Imported
// metrics always start current: 0 and source: "MANUAL" (import never links
// an API metric).
export function buildCreatePayload(
  oma: DraftOma,
  ownerId: string,
  createdById: string,
  periodId: string,
  sequence: number,
  periodStartDate: Date,
  periodEndDate: Date | null,
) {
  return {
    ownerId,
    createdById,
    periodId,
    sequence,
    date: periodStartDate,
    endDate: periodEndDate,
    title: oma.title,
    outcome: oma.outcome,
    metrics: {
      create: oma.metrics
        .filter((m) => m.measure.trim())
        .map((m, i) => ({
          measure: m.measure,
          unit: m.unit,
          direction: m.direction,
          target: m.target,
          current: 0,
          order: i,
          source: "MANUAL" as const,
          apiUrl: null,
          apiPath: null,
          apiKey: null,
        })),
    },
    actions: {
      create: oma.actions
        .filter((a) => a.description.trim())
        .map((a, i) => ({
          description: a.description,
          dueDate: a.dueDate ? new Date(a.dueDate) : null,
          completed: a.completed,
          completedAt: a.completed ? new Date() : null,
          order: i,
        })),
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- createFromDraft.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/omaImport/createFromDraft.ts tests/omaImport/createFromDraft.test.ts
git commit -m "feat: add OMA import validation and create-payload builder"
```

---

## Task 6: `extract.ts` — the Anthropic call (TDD with a mocked client)

**Files:**
- Create: `munro-oma/src/lib/omaImport/extract.ts`
- Test: `munro-oma/tests/omaImport/extract.test.ts`

**Interfaces:**
- Consumes: `extractedImportSchema`, `ExtractedImport` (Task 2).
- Produces: `IMPORT_MODEL` (constant), `ImportNotConfiguredError` (class), `extractFromPdf(pdfBase64: string, filename: string, client?: Anthropic): Promise<ExtractedImport>` — consumed by Task 7 (`actions.ts`).

- [ ] **Step 1: Write the failing tests**

```ts
// munro-oma/tests/omaImport/extract.test.ts
import { afterEach, describe, expect, it, vi } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import { extractFromPdf, ImportNotConfiguredError, IMPORT_MODEL } from "@/lib/omaImport/extract"

const fixture = {
  subjectName: "Sharine Potgieter",
  periodStart: "2026-09-01",
  periodEnd: "2027-02-28",
  omas: [],
  warnings: [],
}

function fakeClient(parsedOutput: unknown) {
  return {
    messages: { parse: vi.fn().mockResolvedValue({ parsed_output: parsedOutput }) },
  } as unknown as Anthropic
}

describe("extractFromPdf", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("sends the PDF as a base64 document block with the model and schema config", async () => {
    const client = fakeClient(fixture)
    await extractFromPdf("BASE64DATA", "test.pdf", client)

    const call = (client.messages.parse as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.model).toBe(IMPORT_MODEL)
    const content = call.messages[0].content
    expect(content[0]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "BASE64DATA" },
    })
    expect(call.output_config.format).toBeDefined()
  })

  it("returns the parsed output on success", async () => {
    const client = fakeClient(fixture)
    const result = await extractFromPdf("BASE64DATA", "test.pdf", client)
    expect(result).toEqual(fixture)
  })

  it("throws a clear error when Claude's response has no parsed_output", async () => {
    const client = fakeClient(null)
    await expect(extractFromPdf("BASE64DATA", "test.pdf", client)).rejects.toThrow(
      /didn't match the expected structure/,
    )
  })

  it("throws ImportNotConfiguredError when no client is given and ANTHROPIC_API_KEY is unset", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    await expect(extractFromPdf("BASE64DATA", "test.pdf")).rejects.toThrow(ImportNotConfiguredError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- extract.test.ts`
Expected: FAIL — `Cannot find module '@/lib/omaImport/extract'`

- [ ] **Step 3: Write the implementation**

```ts
// munro-oma/src/lib/omaImport/extract.ts
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { extractedImportSchema, type ExtractedImport } from "./schema"

// Fixed per D11 — not a cost-driven choice. Extraction quality on messy /
// compound target cells matters more than the price difference to sonnet/haiku.
export const IMPORT_MODEL = "claude-opus-5"

export class ImportNotConfiguredError extends Error {}

const EXTRACTION_INSTRUCTION = `You are extracting structured OMA (Outcome, Metric, Action) data from a business
performance-planning PDF exported from a Word document (the "Munro OMA template").

Return one entry in "omas" for each OUTCOME section in the document (numbered or
not) — there is no cap.

For each OMA:
- "title": a short label derived from the outcome heading (strip a leading
  "OUTCOME n —" if present).
- "outcome": the outcome paragraph, copied verbatim. Do not summarise or shorten it.

For each row under "METRIC / KPI":
- "measure": the text from the "Metric — what you measure" column.
- When a target cell contains MORE THAN ONE independently-numbered clause (e.g.
  several lines, each with its own number — "Volume from 8,750 to 10,500 / Price
  largely constant (0% increase) / Cost per report from R4,000 to R3,500 / Expenses
  around R35m to R39m"), emit ONE kpis entry PER CLAUSE, not one entry for the whole
  cell. Prefix each split entry's "measure" with the parent row's measure, e.g.
  "Production profit — Volume", "Production profit — Cost per report". A cell with
  only one number stays one entry.
- "target": only a number you can defend from the text (e.g. "R3 million" -> 3000000,
  "≥ 90%" -> 90). A range ("10-15%" or "R35m to R39m") -> the LOWER bound, and add a
  warnings entry noting a range was collapsed. A clause stating no change is a real,
  trackable target, not narrative to discard — "Price largely constant (0% increase)"
  -> target 0, unit PERCENT, direction LOWER_BETTER. If the target is "[TBC]", a bare
  date, or pure narrative with no figure -> target null. In every case, always copy
  the original clause text into "targetText" verbatim.
- "unit": CURRENCY for "R…"/"ZAR"/"Rand"; PERCENT for "%"/"NPS"/"score"; DAYS for
  "days"/"turnaround"; else NUMBER. null only if genuinely unclear.
- "direction": LOWER_BETTER for "reduce"/"turnaround"/"drop-off"/"rework"/a
  no-increase constraint; else HIGHER_BETTER. null only if genuinely unclear.

For each row under "ACTIONS":
- "description": the action text.
- "completed": true ONLY on an unambiguous "Complete"/"Done"/"Achieved". "Ongoing",
  "In progress", "TBC", "To implement" -> false.
- "dueDate": an ISO date (YYYY-MM-DD) only when a real calendar date is present
  ("Feb 2027" -> "2027-02-01"). "Ongoing"/"TBC"/a quarter with no year -> null.
- "statusText": the original due-date/status text, verbatim, always kept.

Also return:
- "subjectName": the person's name from the document header, or null if absent.
- "periodStart" / "periodEnd": ISO dates parsed from the document's "Period" line
  (e.g. "Sep 2026 – Aug 2027" -> "2026-09-01" / "2027-08-31"), or null if you can't
  read them.
- "warnings": one entry per null target, per action with no dueDate and a vague
  status, per KPI where unit/direction had to be guessed, and per range collapsed to
  its lower bound.`

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ImportNotConfiguredError("ANTHROPIC_API_KEY is not set")
  }
  return new Anthropic()
}

export async function extractFromPdf(
  pdfBase64: string,
  filename: string,
  client: Anthropic = getClient(),
): Promise<ExtractedImport> {
  const response = await client.messages.parse({
    model: IMPORT_MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: EXTRACTION_INSTRUCTION },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(extractedImportSchema) },
  })

  if (!response.parsed_output) {
    throw new Error(`Claude's response for "${filename}" didn't match the expected structure — try again.`)
  }
  return response.parsed_output
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- extract.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/omaImport/extract.ts tests/omaImport/extract.test.ts
git commit -m "feat: add extractFromPdf (Anthropic PDF extraction call)"
```

---

## Task 7: `actions.ts` — `parsePdf` and `createImportedOmas` server actions

**Files:**
- Create: `munro-oma/src/app/(app)/import/actions.ts`

No dedicated test file — matches the existing convention for server actions in this codebase (`src/app/(app)/person/[userId]/actions.ts` and `src/app/(app)/oma/[omaId]/actions.ts` have no unit tests; they're verified via manual E2E, which is Task 11 here).

**Interfaces:**
- Consumes: `extractFromPdf`, `ImportNotConfiguredError` (Task 6); `toDraft`, `ImportDraft`, `DraftOma` (Task 4); `draftOmaBlockers`, `buildCreatePayload` (Task 5); `getPeriodsWithDates` (Task 3); `canCreateOMA` (existing `src/lib/authz.ts`); `getSessionUser` (existing `src/lib/session.ts`); `withDbRetry` (existing `src/lib/dbRetry.ts`).
- Produces: `parsePdf(formData: FormData): Promise<ImportDraft | { error: string }>`, `createImportedOmas(subjectId: string, periodId: string, omas: DraftOma[]): Promise<{ error: string } | void>` — consumed by Task 9 (`ImportReview.tsx`).

- [ ] **Step 1: Write the implementation**

```ts
// munro-oma/src/app/(app)/import/actions.ts
"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"
import { getPeriodsWithDates } from "@/lib/periods"
import { extractFromPdf, ImportNotConfiguredError } from "@/lib/omaImport/extract"
import { toDraft, type DraftOma, type ImportDraft } from "@/lib/omaImport/toDraft"
import { draftOmaBlockers, buildCreatePayload } from "@/lib/omaImport/createFromDraft"

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
  const subject = await db.user.findUniqueOrThrow({
    where: { id: subjectId },
    select: { id: true, managerId: true, businessUnitId: true },
  })
  const period = await db.period.findUniqueOrThrow({
    where: { id: periodId },
    select: { startDate: true, endDate: true, locked: true },
  })
  if (!canCreateOMA(viewer, subject, period.locked)) return { error: "Not allowed" }
  if (omas.length === 0) return { error: "Nothing to import." }

  for (let i = 0; i < omas.length; i++) {
    const blockers = draftOmaBlockers(omas[i])
    if (blockers.length) return { error: `OMA ${i + 1}: ${blockers.join(" ")}` }
  }

  const last = await db.oMA.findFirst({
    where: { ownerId: subjectId, periodId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  })
  const nextSeq = (last?.sequence ?? 0) + 1

  try {
    // Sequence numbers computed as nextSeq + i, not via a mutated nextSeq++
    // counter — withDbRetry re-invokes this whole callback (including the
    // omas.map) on a retriable connection failure (P2024/P1001), and a
    // post-increment counter would have already advanced past its starting
    // value from the failed attempt, silently skipping sequence numbers on
    // retry. Corrected 2026-09-18 during Task 7 review — found by the task
    // reviewer, not present in the original plan's intent, just its code.
    await withDbRetry(() =>
      db.$transaction(
        omas.map((oma, i) =>
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this exercises the full type chain from Task 2 through Task 5).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/import/actions.ts"
git commit -m "feat: add parsePdf and createImportedOmas server actions"
```

---

## Task 8: `/import/page.tsx` — the Server Component shell

**Files:**
- Create: `munro-oma/src/app/(app)/import/page.tsx`

No test — Server Component data-loading page, verified in Task 11's manual E2E.

**Interfaces:**
- Consumes: `canCreateOMA` (existing); `listPeriods` (existing, `src/lib/periods.ts`); `ImportReview` (Task 9 — this task's file imports it, but Task 9 is written next so the import briefly won't resolve until that task lands; see Task 9's own steps for how the two are landed together).

- [ ] **Step 1: Write the implementation**

```tsx
// munro-oma/src/app/(app)/import/page.tsx
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"
import { listPeriods } from "@/lib/periods"
import { ImportReview } from "@/components/ImportReview"
import { PageTitle } from "@/components/PageTitle"
import { BackButton } from "@/components/BackButton"

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

  return (
    <main>
      <BackButton />
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
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/import/page.tsx"
git commit -m "feat: add /import page shell"
```

(This will not typecheck cleanly until Task 9 adds `ImportReview` — commit anyway per the task boundary above; Task 9 is the very next task and closes the gap.)

---

## Task 9: `ImportReview.tsx` — the upload form + N-OMA review UI

**Files:**
- Create: `munro-oma/src/components/ImportReview.tsx`

No test — client component with heavy interactive UI; the pure logic it calls (`draftOmaBlockers`) is already unit-tested in Task 5. Verified visually + via Task 11's manual E2E, matching `OmaEditForm.tsx`'s own lack of a dedicated test file.

**Interfaces:**
- Consumes: `parsePdf`, `createImportedOmas` (Task 7); `draftOmaBlockers` (Task 5); `ImportDraft`, `DraftOma` (Task 4, re-exported via Task 7's imports); `formatMetricValue`, `parseAmount` (existing `src/lib/progress.ts`); `MetricUnit`, `MetricDirection` (existing `src/types.ts`).

This single client component owns both the upload form and the post-parse review (the spec's "/import upload form" and "&lt;ImportReview&gt;" are one component here, matching how `OmaEditForm.tsx` is a single client component rather than split into row sub-components).

- [ ] **Step 1: Write the implementation**

```tsx
// munro-oma/src/components/ImportReview.tsx
"use client"

import { useRef, useState, useTransition } from "react"
import { parsePdf, createImportedOmas } from "@/app/(app)/import/actions"
import { draftOmaBlockers } from "@/lib/omaImport/createFromDraft"
import { formatMetricValue, parseAmount } from "@/lib/progress"
import type { ImportDraft } from "@/lib/omaImport/toDraft"
import type { MetricDirection, MetricUnit } from "@/types"

type ReviewMetric = {
  measure: string
  unit: MetricUnit
  direction: MetricDirection
  target: string // shorthand-friendly text ("3 mill"), like OmaEditForm's FormMetric.target
  targetText: string
}

type ReviewAction = {
  description: string
  dueDate: string | null
  completed: boolean
  statusText: string
}

type ReviewOma = {
  title: string
  outcome: string
  metrics: ReviewMetric[]
  actions: ReviewAction[]
}

type Phase =
  | { kind: "upload" }
  | { kind: "review"; draft: ImportDraft; omas: ReviewOma[]; subjectId: string; periodId: string }

function toReviewOma(o: ImportDraft["omas"][number]): ReviewOma {
  return {
    title: o.title,
    outcome: o.outcome,
    metrics: o.metrics.map((m) => ({
      measure: m.measure,
      unit: m.unit,
      direction: m.direction,
      // DraftMetric.target is always a finite number (never null/undefined —
      // toDraft defaults a missing AI target to 0), so String(m.target) is
      // unconditionally correct. A truthy check here (`m.target ? ... : ""`)
      // would render a real, meaningful target of 0 as a blank field — and
      // target: 0 is a first-class case for this feature, not an edge case:
      // it's exactly what a "no growth intended" clause like "Price largely
      // constant (0% increase)" resolves to per the compound-target-splitting
      // rule (D12). Corrected 2026-09-18 during Task 9 review.
      target: String(m.target),
      targetText: m.targetText,
    })),
    actions: o.actions.map((a) => ({ ...a })),
  }
}

// A server action that calls redirect() rejects the client promise with a
// framework "error" carrying this digest — control flow, not a failure.
// (Same helper as OmaEditForm.tsx uses for saveOma.)
function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

function num(v: string): string {
  return v.replace(/[^0-9.,\s a-zA-Z$]/g, "")
}

function hint(v: string, unit: MetricUnit): string {
  const n = parseAmount(v)
  if (n === null) return ""
  const formatted = formatMetricValue(n, unit)
  return formatted === v.trim() ? "" : formatted
}

export function ImportReview({
  subjects,
  periods,
  defaultSubjectId,
  defaultPeriodId,
  hasApiKey,
}: {
  subjects: { id: string; name: string }[]
  periods: { id: string; label: string }[]
  defaultSubjectId: string
  defaultPeriodId: string | null
  hasApiKey: boolean
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "upload" })
  const [uploadSubjectId, setUploadSubjectId] = useState(defaultSubjectId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!hasApiKey) {
    return <p className="mt-6 text-mfa-muted">AI import isn&apos;t configured on this environment.</p>
  }

  // Read the file via a ref and build FormData manually, then submit through
  // useTransition — the same onClick-driven pattern OmaEditForm.tsx uses for
  // saveOma, rather than <form action={fn}> (unverified for a plain client
  // function, as opposed to a "use server" action, on React 18.3 / Next 14.2).
  function handleUpload() {
    setError(null)
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError("Choose a PDF to import.")
      return
    }
    const formData = new FormData()
    formData.set("file", file)
    start(async () => {
      const result = await parsePdf(formData)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setPhase({
        kind: "review",
        draft: result,
        omas: result.omas.map(toReviewOma),
        subjectId: uploadSubjectId,
        periodId: result.periodId ?? defaultPeriodId ?? periods[0]?.id ?? "",
      })
    })
  }

  function handleCreate() {
    if (phase.kind !== "review") return
    setError(null)
    const payload = phase.omas.map((o) => ({
      title: o.title,
      outcome: o.outcome,
      metrics: o.metrics.map((m) => ({
        measure: m.measure,
        unit: m.unit,
        direction: m.direction,
        target: parseAmount(m.target) ?? 0,
        targetText: m.targetText,
      })),
      actions: o.actions.map((a) => ({
        description: a.description,
        dueDate: a.dueDate,
        completed: a.completed,
        statusText: a.statusText,
      })),
    }))
    start(() =>
      createImportedOmas(phase.subjectId, phase.periodId, payload)
        .then((result) => {
          if (result && "error" in result) setError(result.error)
        })
        .catch((e: unknown) => {
          if (isRedirectError(e)) return
          setError(e instanceof Error && e.message ? e.message : "Something went wrong while creating. Please try again.")
        }),
    )
  }

  if (phase.kind === "upload") {
    return (
      <div className="max-w-lg space-y-4 rounded-2xl border-2 border-mfa-red p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Import for</span>
          <select
            value={uploadSubjectId}
            onChange={(e) => setUploadSubjectId(e.target.value)}
            className="rounded border border-mfa-track px-2 py-1.5"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">PDF file</span>
          <input ref={fileInputRef} type="file" accept="application/pdf" className="text-sm" />
        </label>
        {error && (
          <p role="alert" className="text-sm font-semibold text-mfa-red">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleUpload}
          disabled={pending}
          className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Reading…" : "Import from PDF"}
        </button>
      </div>
    )
  }

  const cell = "w-full bg-transparent px-3 py-2 outline-none"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border-2 border-mfa-red p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Importing {phase.omas.length} OMAs for</span>
          <select
            value={phase.subjectId}
            onChange={(e) => setPhase({ ...phase, subjectId: e.target.value })}
            className="rounded border border-mfa-track px-2 py-1.5"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Period</span>
          <select
            value={phase.periodId}
            onChange={(e) => setPhase({ ...phase, periodId: e.target.value })}
            className="rounded border border-mfa-track px-2 py-1.5"
          >
            <option value="" disabled>
              Choose a period
            </option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className="w-full text-xs text-mfa-muted">
          AI-drafted from <code>{phase.draft.filename}</code>. Check every field — targets and
          statuses especially.
        </p>
      </div>

      {phase.draft.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-semibold">Check these before creating:</p>
          <ul className="mt-1 list-disc pl-5">
            {phase.draft.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {phase.omas.map((oma, omaIndex) => {
        const setOma = (patch: Partial<ReviewOma>) =>
          setPhase({
            ...phase,
            omas: phase.omas.map((o, i) => (i === omaIndex ? { ...o, ...patch } : o)),
          })
        const removeOma = () =>
          setPhase({ ...phase, omas: phase.omas.filter((_, i) => i !== omaIndex) })

        const blockers = draftOmaBlockers({
          title: oma.title,
          outcome: oma.outcome,
          metrics: oma.metrics.map((m) => ({
            measure: m.measure,
            unit: m.unit,
            direction: m.direction,
            target: parseAmount(m.target) ?? 0,
            targetText: m.targetText,
          })),
          actions: oma.actions,
        })

        return (
          <div key={omaIndex} className="overflow-hidden rounded-2xl border-2 border-mfa-red">
            <div className="flex items-center justify-between gap-3 bg-mfa-red px-5 py-3 text-white">
              <span className="font-bold">Draft OMA {omaIndex + 1}</span>
              <button type="button" onClick={removeOma} className="text-sm text-white/80 hover:text-white">
                Remove this OMA
              </button>
            </div>

            <div className="border-b border-mfa-track px-5 py-3">
              <input
                value={oma.title}
                placeholder="Title"
                onChange={(e) => setOma({ title: e.target.value })}
                className="w-full border-b border-mfa-track bg-transparent py-1 text-lg font-bold outline-none focus:border-mfa-red"
              />
            </div>

            <section className="border-b border-mfa-track">
              <div className="bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">OUTCOME</div>
              <textarea value={oma.outcome} onChange={(e) => setOma({ outcome: e.target.value })} rows={2} className={cell} />
            </section>

            <section className="border-b border-mfa-track">
              <div className="bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">METRIC / KPI</div>
              {oma.metrics.map((m, mi) => {
                const setM = (patch: Partial<ReviewMetric>) =>
                  setOma({ metrics: oma.metrics.map((x, j) => (j === mi ? { ...x, ...patch } : x)) })
                const removeM = () => setOma({ metrics: oma.metrics.filter((_, j) => j !== mi) })
                return (
                  <div
                    key={mi}
                    className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-mfa-track px-5 py-4 text-sm first:border-t-0"
                  >
                    <label className="flex w-full flex-col">
                      <span className="text-xs text-mfa-muted">KPI</span>
                      <input
                        value={m.measure}
                        onChange={(e) => setM({ measure: e.target.value })}
                        className="border-b border-mfa-track bg-transparent py-1 font-semibold outline-none focus:border-mfa-red"
                      />
                    </label>
                    <label className="flex flex-col">
                      <span className="text-xs text-mfa-muted">Unit</span>
                      <select
                        value={m.unit}
                        onChange={(e) => setM({ unit: e.target.value as MetricUnit })}
                        className="rounded border border-mfa-track bg-white px-2 py-1.5"
                      >
                        <option value="NUMBER">Number</option>
                        <option value="CURRENCY">Currency (R)</option>
                        <option value="PERCENT">Percent</option>
                        <option value="DAYS">Days</option>
                      </select>
                    </label>
                    <div className="flex flex-col">
                      <span className="text-xs text-mfa-muted">Direction</span>
                      <div className="inline-flex overflow-hidden rounded border border-mfa-track">
                        {(["HIGHER_BETTER", "LOWER_BETTER"] as const).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setM({ direction: d })}
                            className={`px-2.5 py-1.5 ${m.direction === d ? "bg-mfa-red text-white" : "text-mfa-muted"}`}
                          >
                            {d === "HIGHER_BETTER" ? "↑ Higher" : "↓ Lower"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex w-32 flex-col">
                      <span className="text-xs text-mfa-muted">Target</span>
                      <input
                        value={m.target}
                        placeholder="0"
                        onChange={(e) => setM({ target: num(e.target.value) })}
                        className="rounded border border-mfa-track px-2 py-1.5"
                      />
                    </label>
                    <button type="button" onClick={removeM} className="px-2 text-mfa-muted">
                      ✕
                    </button>
                    {(hint(m.target, m.unit) || (!m.target && m.targetText)) && (
                      <div className="w-full text-xs text-mfa-muted">
                        {hint(m.target, m.unit) && <span>Resolves to: {hint(m.target, m.unit)}</span>}
                        {m.targetText && <span className="ml-4 italic">From PDF: &quot;{m.targetText}&quot;</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="px-5 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setOma({
                      metrics: [
                        ...oma.metrics,
                        { measure: "", unit: "NUMBER", direction: "HIGHER_BETTER", target: "", targetText: "" },
                      ],
                    })
                  }
                  className="text-sm text-mfa-red"
                >
                  + Add KPI
                </button>
              </div>
            </section>

            <section>
              <div className="bg-mfa-muted px-5 py-2 text-sm font-semibold text-white">ACTIONS</div>
              {oma.actions.map((a, ai) => {
                const setA = (patch: Partial<ReviewAction>) =>
                  setOma({ actions: oma.actions.map((x, j) => (j === ai ? { ...x, ...patch } : x)) })
                const removeA = () => setOma({ actions: oma.actions.filter((_, j) => j !== ai) })
                return (
                  <div
                    key={ai}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border-t border-mfa-track px-3 py-2 first:border-t-0"
                  >
                    <input
                      type="checkbox"
                      checked={a.completed}
                      onChange={(e) => setA({ completed: e.target.checked })}
                      className="h-4 w-4 accent-mfa-red"
                    />
                    <input
                      value={a.description}
                      onChange={(e) => setA({ description: e.target.value })}
                      className={cell}
                    />
                    <div className="flex flex-col text-xs text-mfa-muted">
                      <input
                        type="date"
                        value={a.dueDate ?? ""}
                        onChange={(e) => setA({ dueDate: e.target.value || null })}
                        className="bg-transparent py-1 outline-none"
                      />
                      {a.statusText && <span className="italic">From PDF: &quot;{a.statusText}&quot;</span>}
                    </div>
                    <button type="button" onClick={removeA} className="px-2 text-mfa-muted">
                      ✕
                    </button>
                  </div>
                )
              })}
              <div className="px-5 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setOma({ actions: [...oma.actions, { description: "", dueDate: null, completed: false, statusText: "" }] })
                  }
                  className="text-sm text-mfa-red"
                >
                  + Add action
                </button>
              </div>
            </section>

            {blockers.length > 0 && (
              <p className="border-t border-mfa-track px-5 py-2 text-sm font-semibold text-mfa-red">
                Won&apos;t save yet: {blockers.join(" ")}
              </p>
            )}
          </div>
        )
      })}

      <div className="flex items-center justify-end gap-3">
        {error && (
          <p role="alert" className="mr-auto text-sm font-semibold text-mfa-red">
            {error}
          </p>
        )}
        <button type="button" onClick={() => setPhase({ kind: "upload" })} className="text-sm text-mfa-muted">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={
            pending ||
            phase.omas.length === 0 ||
            !phase.periodId ||
            phase.omas.some(
              (o) =>
                draftOmaBlockers({
                  title: o.title,
                  outcome: o.outcome,
                  metrics: o.metrics.map((m) => ({
                    measure: m.measure,
                    unit: m.unit,
                    direction: m.direction,
                    target: parseAmount(m.target) ?? 0,
                    targetText: m.targetText,
                  })),
                  actions: o.actions,
                }).length > 0,
            )
          }
          className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : `Create ${phase.omas.length} OMAs`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this closes Task 8's dangling import of `ImportReview`).

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new `omaImport/*` tests, unaffected by this UI-only change.

- [ ] **Step 4: Commit**

```bash
git add src/components/ImportReview.tsx
git commit -m "feat: add ImportReview upload + N-OMA review UI"
```

---

## Task 10: "Upload OMA" button on the person page

**Files:**
- Modify: `munro-oma/src/app/(app)/person/[userId]/page.tsx:117-125`

No test — a one-element JSX change to an existing Server Component page; verified in Task 11's manual E2E.

- [ ] **Step 1: Replace the "+ Add OMA" button block**

In `src/app/(app)/person/[userId]/page.tsx`, replace:

```tsx
      {mayAdd && person.omas.length > 0 && (
        <div className="mt-12 flex justify-end">
          <form action={createOma.bind(null, person.id, periodId)}>
            <button className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white">
              + Add OMA
            </button>
          </form>
        </div>
      )}
```

with:

```tsx
      {mayAdd && (
        <div className="mt-12 flex justify-end gap-3">
          <Link
            href={`/import?subject=${person.id}&period=${periodId}`}
            className="rounded-full border-2 border-mfa-red px-6 py-2 font-semibold text-mfa-red"
          >
            Upload OMA
          </Link>
          {person.omas.length > 0 && (
            <form action={createOma.bind(null, person.id, periodId)}>
              <button className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white">
                + Add OMA
              </button>
            </form>
          )}
        </div>
      )}
```

`Link` is already imported at the top of this file (line 1: `import Link from "next/link"`) — no new import needed. This shows "Upload OMA" whenever `mayAdd` is true, regardless of `person.omas.length` (unlike "+ Add OMA", which still only shows once the person has at least one OMA — an empty list already has its own "start OMA 1" affordance via the `RagBar` a few lines above).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/person/[userId]/page.tsx"
git commit -m "feat: add Upload OMA button to the person page"
```

---

## Task 11: Manual API checks, E2E, and regression

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

```bash
npm run typecheck && npm test
```

Expected: PASS, no regressions.

- [ ] **Step 2: Manual API check #1 — Sharine's PDF**

Start the dev server (`npm run dev`), sign in as an admin/manager, go to a person page, click "Upload OMA", upload `OMA Template_Marketing Manager_Sharine Potgieter_Sep2026.pdf` (get this file from the user — it lives outside this repo). Confirm: 4 OMAs drafted, sane titles, outcomes verbatim, `[TBC]` targets flagged in the warnings box, "Ongoing" actions not marked completed.

- [ ] **Step 3: Manual API check #2 — Alex Munro's PDF (the D12 compound-target case)**

Upload `~/Downloads/OMA_Template_Alex_Munro.pdf`. Confirm:
- 3 OMAs drafted (one per OUTCOME section).
- OMA 2's "Production profit" row becomes **4 separate KPI rows** — Volume (target 10500, HIGHER_BETTER), Price (target 0, PERCENT, LOWER_BETTER), Cost per report (target 3500, CURRENCY, LOWER_BETTER), Expenses (target 35000000, CURRENCY, LOWER_BETTER, with a warning that a range was collapsed to its lower bound) — not one row.
- OMA 1's two KPI rows ("Share Price…" and "Year-1 milestone…") stay separate, as the template already has them.
- OMA 3's "Number of people scoring 7/10 or higher" KPI is flagged in the warnings box (its target, "# of team at +7/10", has no defensible absolute number without a known headcount, so `target: null` → defaulted to 0 by `toDraft`, which fails `draftOmaBlockers` until the reviewer fills in a real number).

- [ ] **Step 4: Manual E2E**

From the Alex Munro upload's review screen: fix the flagged OMA 3 KPI target, confirm subject + period, click "Create 3 OMAs". Confirm: redirected to `/person/<id>`, 3 new OMAs appear at the next free sequence numbers, any OMAs that already existed for that person/period are untouched. Then: sign in as a plain USER and confirm "Upload OMA" only offers themselves as a subject; try importing for someone else via a hand-edited URL and confirm the create is refused; try against a locked period and confirm the same "not allowed" behaviour as manual OMA creation.

- [ ] **Step 5: Confirm the dashboard rollup**

Open the person page and the business-unit/company dashboard for the imported person. Confirm the newly-created OMAs' percentages appear and roll up exactly like manually-created OMAs (via the existing `omaProgress`/`personProgress`/`buProgress` — untouched by this feature).

- [ ] **Step 6: Final regression pass**

```bash
npm run typecheck && npm test && npm run build
```

Expected: all green. This is the merge gate.

---
