# Review Module (OMA Scorecard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sealed Review module where a manager scores each of a person's OMAs for a period (1 Below / 2 Meets / 3 Exceeds) with comments, snapshotted at review open, averaged into a final score the person sees once the review is completed.

**Architecture:** New `src/modules/review/` folder, walled off by an ESLint import-boundary rule. The only contact with OMA data is one new read-only file, `src/lib/omaForReview.ts`. New `Review` + `ReviewItem` Postgres tables, foreign-keyed only to `User` and `Period`; each `ReviewItem` carries a frozen JSON snapshot of one OMA. No existing OMA file is modified; the two shared touch-points are `prisma/schema.prisma` (new tables) and `src/components/AppHeader.tsx` (one nav link).

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), Prisma 5 + PostgreSQL (Supabase), Zod, Tailwind, Vitest. Node `crypto.randomUUID()` for snapshot ref ids (no new dependency).

**Spec:** `docs/superpowers/specs/2026-09-09-review-module-design.md`

## Global Constraints

- **Do not modify any existing OMA file.** Permitted edits outside `src/modules/review/` and `src/app/(app)/review/` and `src/app/(app)/admin/reviews/`: `prisma/schema.prisma` (additive only), `src/components/AppHeader.tsx` (one link), `src/app/(app)/person/[userId]/page.tsx` (one import + one element), `.eslintrc.json` (boundary rule), `prisma/seed.ts` (additive, optional). Nothing else.
- **The existing test suite stays green, unchanged.** Run `npm test` (69 tests) after every task.
- **One database, and it is live.** `npx prisma migrate deploy` against it is fine for additive migrations. **Never** run `npm run db:seed` or `npm run test:integration` — they wipe the database.
- **Review tables** are prefixed `Review`, sit in a delimited block in the schema, and have foreign keys only to `User` and `Period` — never to `OMA`, `Metric`, `Action`.
- **Rating labels** (verbatim): `BELOW` → "Below Expectation", `MEETS` → "Meets Expectation", `EXCEEDS` → "Exceeds Expectation". Numeric values: BELOW 1, MEETS 2, EXCEEDS 3.
- **Final score** = arithmetic mean of the per-OMA rating numbers, rounded to 1 decimal place. Displayed as `"<score> / 3"`.
- **Commit** after every task with a green suite. Work happens on a branch: `git checkout -b feat/review-module` before Task 1.
- Match existing code style: 2-space indent, no semicolons, double quotes, `import type` for type-only imports, `db` from `@/lib/db`, `getSessionUser` from `@/lib/session`, server actions start `"use server"` and validate session + authz before any write.

---

### Task 1: Schema + migration for `Review` / `ReviewItem`

**Files:**
- Modify: `prisma/schema.prisma` (append a `Review` block; add two back-relations to `model User`; add one to `model Period`)
- Create: `prisma/migrations/<timestamp>_review_module/migration.sql` (generated)
- Test: none (verified via `prisma migrate status`, `tsc`, existing suite)

**Interfaces:**
- Produces: Prisma models `Review`, `ReviewItem`; enums `ReviewStatus` (`OPEN`, `COMPLETED`), `OmaRating` (`BELOW`, `MEETS`, `EXCEEDS`). `db.review` and `db.reviewItem` become available.

- [ ] **Step 1: Add the enums and models to `prisma/schema.prisma`**

Append at the end of the file:

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// Review module (OMA Scorecard). FKs only to User and Period — never to OMA.
// Design: docs/superpowers/specs/2026-09-09-review-module-design.md
// ─────────────────────────────────────────────────────────────────────────────

enum ReviewStatus {
  OPEN
  COMPLETED
}

enum OmaRating {
  BELOW
  MEETS
  EXCEEDS
}

model Review {
  id          String       @id @default(cuid())
  subject     User         @relation("ReviewSubject", fields: [subjectId], references: [id])
  subjectId   String
  scorer      User         @relation("ReviewScorer", fields: [scorerId], references: [id])
  scorerId    String
  period      Period       @relation(fields: [periodId], references: [id])
  periodId    String
  status      ReviewStatus @default(OPEN)
  finalScore  Float? // mean of item ratings (1..3, 1 dp); frozen on complete
  reviewDate  DateTime? // stamped on complete
  createdById String? // who opened it — admin batch or manager ad-hoc
  createdAt   DateTime     @default(now())
  completedAt DateTime?
  items       ReviewItem[]

  @@unique([subjectId, periodId])
  @@index([scorerId])
  @@index([status])
}

model ReviewItem {
  id       String     @id @default(cuid())
  review   Review     @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  reviewId String
  omaId    String // reference only — NOT a relation. Survives OMA deletion.
  order    Int
  sequence Int
  title    String
  outcome  String
  kpis     Json // [{ ref, measure, unit, direction, target, current }]
  actions  Json // [{ ref, description, dueDate, completed }]
  rating   OmaRating?
  comment  String?
  notes    Json? // [{ ref, kind: "kpi" | "action", text }]

  @@index([reviewId])
}
```

- [ ] **Step 2: Add the back-relations to existing models**

In `model User`, add these two lines alongside the other relation fields (e.g. after `createdOmas`):

```prisma
  reviewsAsSubject Review[] @relation("ReviewSubject")
  reviewsAsScorer  Review[] @relation("ReviewScorer")
```

In `model Period`, add alongside `omas`:

```prisma
  reviews Review[]
```

- [ ] **Step 3: Generate the migration without applying it**

Run: `npx prisma migrate dev --create-only --name review_module`
Expected: prints "Prisma Migrate created the following migration without applying it".

- [ ] **Step 4: Inspect the generated SQL**

Run: `cat prisma/migrations/*_review_module/migration.sql`
Expected: only `CREATE TYPE` (2 enums) and `CREATE TABLE` (`Review`, `ReviewItem`) plus their indexes and foreign keys to `"User"` and `"Period"`. **No `ALTER TABLE "OMA"`, `"Metric"`, `"Action"`.** If anything alters an existing table, stop and re-check Step 2.

- [ ] **Step 5: Apply the migration to the database**

Run: `npx prisma migrate deploy`
Expected: "The following migration(s) have been applied: ..._review_module".

- [ ] **Step 6: Regenerate the client and typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: client generated; no type errors.

- [ ] **Step 7: Run the existing suite**

Run: `npm test`
Expected: 69 passed.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(review): add Review and ReviewItem tables"
```

---

### Task 2: ESLint import-boundary rule

**Files:**
- Modify: `.eslintrc.json`
- Test: none (verified by temporarily adding bad imports)

**Interfaces:**
- Produces: a lint failure whenever `src/modules/review/**` imports OMA-specific code, or any OMA file imports `@/modules/review/**`.

- [ ] **Step 1: Replace `.eslintrc.json` with the boundary rule**

```json
{
  "extends": "next/core-web-vitals",
  "overrides": [
    {
      "files": ["src/modules/review/**/*.{ts,tsx}"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": [
                  "@/lib/queries",
                  "@/lib/omaValidation",
                  "@/lib/omaCopy",
                  "@/lib/admin",
                  "@/components/*",
                  "@/app/*"
                ],
                "message": "review module is sealed: import shared infra from @/lib/{db,session,periods,authz,dbRetry,progress} or the seam @/lib/omaForReview only"
              }
            ]
          }
        ]
      }
    },
    {
      "files": [
        "src/lib/queries.ts",
        "src/lib/omaValidation.ts",
        "src/lib/omaCopy.ts",
        "src/lib/progress.ts",
        "src/lib/omaForReview.ts",
        "src/components/Oma*.{ts,tsx}",
        "src/components/CopyOmaButton.tsx",
        "src/components/DeleteOmaButton.tsx",
        "src/app/(app)/oma/**/*.{ts,tsx}",
        "src/app/(app)/person/**/*.{ts,tsx}",
        "src/app/(app)/bu/**/*.{ts,tsx}"
      ],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": ["@/modules/review", "@/modules/review/*"],
                "message": "OMA code must not depend on the review module"
              }
            ]
          }
        ]
      }
    }
  ]
}
```

Note: `src/components/*` in the review override blocks OMA components; review's own components live under `src/modules/review/components/` and are imported with a relative path, so they are unaffected.

- [ ] **Step 2: Verify the rule fires from the review side**

Create `src/modules/review/_boundary_probe.ts` with:

```ts
import { getOma } from "@/lib/queries"
export const probe = getOma
```

Run: `npx next lint --dir src/modules/review`
Expected: error on the import — "review module is sealed: ...".

- [ ] **Step 3: Verify the rule fires from the OMA side**

Add to the top of `src/lib/omaCopy.ts` (temporarily):

```ts
import "@/modules/review/_boundary_probe"
```

Run: `npx next lint --dir src/lib`
Expected: error — "OMA code must not depend on the review module".

- [ ] **Step 4: Remove both probes**

Delete `src/modules/review/_boundary_probe.ts` and the temporary import line in `src/lib/omaCopy.ts`.

Run: `npx next lint` and `git status`
Expected: no lint errors; `git status` shows only `.eslintrc.json` modified.

- [ ] **Step 5: Commit**

```bash
git add .eslintrc.json
git commit -m "feat(review): ESLint import boundary between review and OMA"
```

---

### Task 3: The OMA seam — `src/lib/omaForReview.ts`

**Files:**
- Create: `src/lib/omaForReview.ts`
- Test: `tests/review/omaForReview.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`; Prisma types `MetricUnit`, `MetricDirection` from `@prisma/client`.
- Produces:
  - `type OmaForReview = { omaId: string; sequence: number; title: string; outcome: string; kpis: OmaForReviewKpi[]; actions: OmaForReviewAction[] }`
  - `type OmaForReviewKpi = { measure: string; unit: MetricUnit; direction: MetricDirection; target: number; current: number }`
  - `type OmaForReviewAction = { description: string; dueDate: Date | null; completed: boolean }`
  - `mapOmaForReview(row): OmaForReview` — pure mapper
  - `getOmasForReview(userId: string, periodId: string): Promise<OmaForReview[]>` — thin query, ordered by `sequence` asc

- [ ] **Step 1: Write the failing test**

`tests/review/omaForReview.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { mapOmaForReview } from "@/lib/omaForReview"

const row = {
  id: "oma1",
  sequence: 2,
  title: "Grow pipeline",
  outcome: "A predictable flow of qualified opportunities.",
  metrics: [
    {
      measure: "Qualified opps",
      unit: "NUMBER" as const,
      direction: "HIGHER_BETTER" as const,
      target: 40,
      current: 12,
      order: 0,
    },
  ],
  actions: [
    {
      description: "Rebuild the outreach list",
      dueDate: new Date("2026-02-15"),
      completed: true,
      order: 0,
    },
    { description: "Book 10 calls", dueDate: null, completed: false, order: 1 },
  ],
}

describe("mapOmaForReview", () => {
  it("flattens a prisma OMA row to the review shape", () => {
    expect(mapOmaForReview(row)).toEqual({
      omaId: "oma1",
      sequence: 2,
      title: "Grow pipeline",
      outcome: "A predictable flow of qualified opportunities.",
      kpis: [
        {
          measure: "Qualified opps",
          unit: "NUMBER",
          direction: "HIGHER_BETTER",
          target: 40,
          current: 12,
        },
      ],
      actions: [
        { description: "Rebuild the outreach list", dueDate: new Date("2026-02-15"), completed: true },
        { description: "Book 10 calls", dueDate: null, completed: false },
      ],
    })
  })

  it("keeps metrics and actions in their given order", () => {
    const out = mapOmaForReview(row)
    expect(out.actions.map((a) => a.description)).toEqual([
      "Rebuild the outreach list",
      "Book 10 calls",
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/review/omaForReview.test.ts`
Expected: FAIL — cannot find module `@/lib/omaForReview`.

- [ ] **Step 3: Write `src/lib/omaForReview.ts`**

```ts
// Read-only. The single point of contact between the Review module and OMA data.
// Additive file — no existing OMA code is changed. If OMA ever becomes its own
// module this file moves there and nothing else changes.
import type { MetricDirection, MetricUnit } from "@prisma/client"
import { db } from "@/lib/db"

export type OmaForReviewKpi = {
  measure: string
  unit: MetricUnit
  direction: MetricDirection
  target: number
  current: number
}

export type OmaForReviewAction = {
  description: string
  dueDate: Date | null
  completed: boolean
}

export type OmaForReview = {
  omaId: string
  sequence: number
  title: string
  outcome: string
  kpis: OmaForReviewKpi[]
  actions: OmaForReviewAction[]
}

type OmaRow = {
  id: string
  sequence: number
  title: string
  outcome: string
  metrics: (OmaForReviewKpi & { order: number })[]
  actions: (OmaForReviewAction & { order: number })[]
}

export function mapOmaForReview(row: OmaRow): OmaForReview {
  return {
    omaId: row.id,
    sequence: row.sequence,
    title: row.title,
    outcome: row.outcome,
    kpis: row.metrics.map((m) => ({
      measure: m.measure,
      unit: m.unit,
      direction: m.direction,
      target: m.target,
      current: m.current,
    })),
    actions: row.actions.map((a) => ({
      description: a.description,
      dueDate: a.dueDate,
      completed: a.completed,
    })),
  }
}

export async function getOmasForReview(
  userId: string,
  periodId: string,
): Promise<OmaForReview[]> {
  const omas = await db.oMA.findMany({
    where: { ownerId: userId, periodId },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      sequence: true,
      title: true,
      outcome: true,
      metrics: {
        orderBy: { order: "asc" },
        select: {
          measure: true,
          unit: true,
          direction: true,
          target: true,
          current: true,
          order: true,
        },
      },
      actions: {
        orderBy: { order: "asc" },
        select: { description: true, dueDate: true, completed: true, order: true },
      },
    },
  })
  return omas.map(mapOmaForReview)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/review/omaForReview.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/omaForReview.ts tests/review/omaForReview.test.ts
git commit -m "feat(review): add getOmasForReview seam"
```

---

### Task 4: `scoring.ts` — pure rating maths

**Files:**
- Create: `src/modules/review/scoring.ts`
- Test: `tests/review/scoring.test.ts`

**Interfaces:**
- Consumes: `OmaRating` from `@prisma/client`.
- Produces:
  - `RATING_VALUE: Record<OmaRating, 1 | 2 | 3>`
  - `ratingNumber(r: OmaRating): 1 | 2 | 3`
  - `ratingLabel(r: OmaRating): string`
  - `finalScore(items: { rating: OmaRating | null }[]): number | null` — null if any unrated or list empty; else mean to 1 dp
  - `runningAverage(items: { rating: OmaRating | null }[]): number | null` — mean of rated items only; null if none rated
  - `canComplete(items: { rating: OmaRating | null }[]): boolean` — true iff non-empty and all rated

- [ ] **Step 1: Write the failing test**

`tests/review/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  canComplete,
  finalScore,
  ratingLabel,
  ratingNumber,
  runningAverage,
} from "@/modules/review/scoring"

const r = (...vals: ("BELOW" | "MEETS" | "EXCEEDS" | null)[]) => vals.map((rating) => ({ rating }))

describe("ratingNumber / ratingLabel", () => {
  it("maps ratings to 1/2/3", () => {
    expect(ratingNumber("BELOW")).toBe(1)
    expect(ratingNumber("MEETS")).toBe(2)
    expect(ratingNumber("EXCEEDS")).toBe(3)
  })
  it("maps ratings to the expectation labels", () => {
    expect(ratingLabel("BELOW")).toBe("Below Expectation")
    expect(ratingLabel("MEETS")).toBe("Meets Expectation")
    expect(ratingLabel("EXCEEDS")).toBe("Exceeds Expectation")
  })
})

describe("finalScore", () => {
  it("is the mean of the rating numbers, 1 dp", () => {
    expect(finalScore(r("MEETS", "EXCEEDS", "MEETS"))).toBe(2.3)
  })
  it("is a whole number when it divides evenly", () => {
    expect(finalScore(r("MEETS", "MEETS"))).toBe(2)
  })
  it("is null when any item is unrated", () => {
    expect(finalScore(r("MEETS", null))).toBeNull()
  })
  it("is null for an empty list", () => {
    expect(finalScore([])).toBeNull()
  })
})

describe("runningAverage", () => {
  it("averages only the rated items", () => {
    expect(runningAverage(r("EXCEEDS", "MEETS", null))).toBe(2.5)
  })
  it("is null when nothing is rated", () => {
    expect(runningAverage(r(null, null))).toBeNull()
  })
})

describe("canComplete", () => {
  it("is true only when every item is rated", () => {
    expect(canComplete(r("MEETS", "BELOW"))).toBe(true)
  })
  it("is false when an item is unrated", () => {
    expect(canComplete(r("MEETS", null))).toBe(false)
  })
  it("is false for an empty list", () => {
    expect(canComplete([])).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/review/scoring.test.ts`
Expected: FAIL — cannot find module `@/modules/review/scoring`.

- [ ] **Step 3: Write `src/modules/review/scoring.ts`**

```ts
import type { OmaRating } from "@prisma/client"

export const RATING_VALUE: Record<OmaRating, 1 | 2 | 3> = {
  BELOW: 1,
  MEETS: 2,
  EXCEEDS: 3,
}

const RATING_LABEL: Record<OmaRating, string> = {
  BELOW: "Below Expectation",
  MEETS: "Meets Expectation",
  EXCEEDS: "Exceeds Expectation",
}

export function ratingNumber(r: OmaRating): 1 | 2 | 3 {
  return RATING_VALUE[r]
}

export function ratingLabel(r: OmaRating): string {
  return RATING_LABEL[r]
}

function mean1dp(nums: number[]): number {
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  return Math.round(avg * 10) / 10
}

export function finalScore(items: { rating: OmaRating | null }[]): number | null {
  if (items.length === 0) return null
  if (items.some((i) => i.rating === null)) return null
  return mean1dp(items.map((i) => RATING_VALUE[i.rating as OmaRating]))
}

export function runningAverage(items: { rating: OmaRating | null }[]): number | null {
  const rated = items.filter((i) => i.rating !== null)
  if (rated.length === 0) return null
  return mean1dp(rated.map((i) => RATING_VALUE[i.rating as OmaRating]))
}

export function canComplete(items: { rating: OmaRating | null }[]): boolean {
  return items.length > 0 && items.every((i) => i.rating !== null)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/review/scoring.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/review/scoring.ts tests/review/scoring.test.ts
git commit -m "feat(review): scoring maths"
```

---

### Task 5: `snapshot.ts` — build and refresh review items

**Files:**
- Create: `src/modules/review/snapshot.ts`
- Test: `tests/review/snapshot.test.ts`

**Interfaces:**
- Consumes: `OmaForReview`, `OmaForReviewKpi`, `OmaForReviewAction` from `@/lib/omaForReview`; `OmaRating` from `@prisma/client`.
- Produces:
  - `type SnapshotKpi = OmaForReviewKpi & { ref: string }`
  - `type SnapshotAction = OmaForReviewAction & { ref: string }`
  - `type ItemNote = { ref: string; kind: "kpi" | "action"; text: string }`
  - `type NewItem = { omaId: string; order: number; sequence: number; title: string; outcome: string; kpis: SnapshotKpi[]; actions: SnapshotAction[] }`
  - `type ExistingItem = NewItem & { id: string; rating: OmaRating | null; comment: string | null; notes: ItemNote[] }`
  - `buildItems(omas: OmaForReview[], makeRef?: () => string): NewItem[]`
  - `mergeRefresh(existing: ExistingItem[], fresh: OmaForReview[], makeRef?: () => string): { create: NewItem[]; update: { id: string; data: Omit<NewItem, "omaId"> & { notes: ItemNote[] } }[]; deleteIds: string[] }`

- [ ] **Step 1: Write the failing test**

`tests/review/snapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { buildItems, mergeRefresh } from "@/modules/review/snapshot"
import type { OmaForReview } from "@/lib/omaForReview"

// deterministic ref generator: r0, r1, r2, ...
const seq = () => {
  let n = 0
  return () => `r${n++}`
}

const oma = (over: Partial<OmaForReview> = {}): OmaForReview => ({
  omaId: "oma1",
  sequence: 1,
  title: "HR Effectiveness",
  outcome: "Efficient and effective HR.",
  kpis: [
    { measure: "eNPS", unit: "PERCENT", direction: "HIGHER_BETTER", target: 100, current: 78 },
  ],
  actions: [{ description: "Roll out onboarding", dueDate: null, completed: false }],
  ...over,
})

describe("buildItems", () => {
  it("creates one item per OMA with order = index and a ref on every kpi/action", () => {
    const items = buildItems([oma(), oma({ omaId: "oma2", sequence: 2 })], seq())
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ omaId: "oma1", order: 0, sequence: 1, title: "HR Effectiveness" })
    expect(items[1]).toMatchObject({ omaId: "oma2", order: 1 })
    expect(items[0].kpis[0].ref).toBe("r0")
    expect(items[0].actions[0].ref).toBe("r1")
  })
})

describe("mergeRefresh", () => {
  const existing = [
    {
      id: "item1",
      omaId: "oma1",
      order: 0,
      sequence: 1,
      title: "HR Effectiveness",
      outcome: "old outcome",
      kpis: [
        { ref: "old-k", measure: "eNPS", unit: "PERCENT", direction: "HIGHER_BETTER", target: 100, current: 50 },
      ],
      actions: [{ ref: "old-a", description: "Roll out onboarding", dueDate: null, completed: false }],
      rating: "MEETS" as const,
      comment: "good progress",
      notes: [
        { ref: "old-k", kind: "kpi" as const, text: "trending up" },
        { ref: "old-a", kind: "action" as const, text: "started late" },
      ],
    },
  ]

  it("keeps rating and comment, re-snapshots the OMA, re-points a kpi note by measure", () => {
    const res = mergeRefresh(existing, [oma({ outcome: "new outcome" })], seq())
    expect(res.create).toEqual([])
    expect(res.deleteIds).toEqual([])
    expect(res.update).toHaveLength(1)
    const u = res.update[0]
    expect(u.id).toBe("item1")
    expect(u.data.outcome).toBe("new outcome")
    expect(u.data.rating).toBe("MEETS")
    expect(u.data.comment).toBe("good progress")
    // kpi note re-attached to the new ref because "eNPS" still exists
    const newKpiRef = u.data.kpis[0].ref
    expect(u.data.notes).toContainEqual({ ref: newKpiRef, kind: "kpi", text: "trending up" })
    const newActionRef = u.data.actions[0].ref
    expect(u.data.notes).toContainEqual({ ref: newActionRef, kind: "action", text: "started late" })
  })

  it("drops a kpi note when its measure is gone from the fresh snapshot", () => {
    const fresh = oma({
      kpis: [
        { measure: "Retention", unit: "PERCENT", direction: "HIGHER_BETTER", target: 90, current: 80 },
      ],
    })
    const res = mergeRefresh(existing, [fresh], seq())
    expect(res.update[0].data.notes).toEqual([
      // only the action note survives
      { ref: res.update[0].data.actions[0].ref, kind: "action", text: "started late" },
    ])
  })

  it("adds an unrated item for a new OMA", () => {
    const res = mergeRefresh(existing, [oma(), oma({ omaId: "oma2", sequence: 2 })], seq())
    expect(res.create).toHaveLength(1)
    expect(res.create[0].omaId).toBe("oma2")
  })

  it("deletes an item whose OMA is gone", () => {
    const res = mergeRefresh(existing, [], seq())
    expect(res.deleteIds).toEqual(["item1"])
    expect(res.update).toEqual([])
  })

  it("renumbers order to match the fresh sequence order", () => {
    const res = mergeRefresh(existing, [oma({ omaId: "oma2", sequence: 2 }), oma()], seq())
    const item1Update = res.update.find((u) => u.id === "item1")
    expect(item1Update?.data.order).toBe(1) // oma1 is now second
    expect(res.create[0].order).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/review/snapshot.test.ts`
Expected: FAIL — cannot find module `@/modules/review/snapshot`.

- [ ] **Step 3: Write `src/modules/review/snapshot.ts`**

```ts
import { randomUUID } from "node:crypto"
import type { OmaRating } from "@prisma/client"
import type { OmaForReview, OmaForReviewAction, OmaForReviewKpi } from "@/lib/omaForReview"

export type SnapshotKpi = OmaForReviewKpi & { ref: string }
export type SnapshotAction = OmaForReviewAction & { ref: string }
export type ItemNote = { ref: string; kind: "kpi" | "action"; text: string }

export type NewItem = {
  omaId: string
  order: number
  sequence: number
  title: string
  outcome: string
  kpis: SnapshotKpi[]
  actions: SnapshotAction[]
}

export type ExistingItem = NewItem & {
  id: string
  rating: OmaRating | null
  comment: string | null
  notes: ItemNote[]
}

type RefreshResult = {
  create: NewItem[]
  update: { id: string; data: Omit<NewItem, "omaId"> & { rating: OmaRating | null; comment: string | null; notes: ItemNote[] } }[]
  deleteIds: string[]
}

function snapshotOma(oma: OmaForReview, order: number, makeRef: () => string): NewItem {
  return {
    omaId: oma.omaId,
    order,
    sequence: oma.sequence,
    title: oma.title,
    outcome: oma.outcome,
    kpis: oma.kpis.map((k) => ({ ...k, ref: makeRef() })),
    actions: oma.actions.map((a) => ({ ...a, ref: makeRef() })),
  }
}

export function buildItems(omas: OmaForReview[], makeRef: () => string = randomUUID): NewItem[] {
  return omas.map((oma, i) => snapshotOma(oma, i, makeRef))
}

// Re-attach notes to the fresh snapshot: kpi notes by matching `measure`,
// action notes by matching `description`. Notes with no text match are dropped.
function remapNotes(
  oldItem: ExistingItem,
  fresh: NewItem,
): ItemNote[] {
  const out: ItemNote[] = []
  for (const note of oldItem.notes) {
    if (note.kind === "kpi") {
      const oldKpi = oldItem.kpis.find((k) => k.ref === note.ref)
      const newKpi = oldKpi && fresh.kpis.find((k) => k.measure === oldKpi.measure)
      if (newKpi) out.push({ ref: newKpi.ref, kind: "kpi", text: note.text })
    } else {
      const oldAction = oldItem.actions.find((a) => a.ref === note.ref)
      const newAction =
        oldAction && fresh.actions.find((a) => a.description === oldAction.description)
      if (newAction) out.push({ ref: newAction.ref, kind: "action", text: note.text })
    }
  }
  return out
}

export function mergeRefresh(
  existing: ExistingItem[],
  fresh: OmaForReview[],
  makeRef: () => string = randomUUID,
): RefreshResult {
  const byOmaId = new Map(existing.map((e) => [e.omaId, e]))
  const freshOmaIds = new Set(fresh.map((o) => o.omaId))

  const create: NewItem[] = []
  const update: RefreshResult["update"] = []

  fresh.forEach((oma, i) => {
    const snap = snapshotOma(oma, i, makeRef)
    const old = byOmaId.get(oma.omaId)
    if (!old) {
      create.push(snap)
      return
    }
    update.push({
      id: old.id,
      data: {
        order: snap.order,
        sequence: snap.sequence,
        title: snap.title,
        outcome: snap.outcome,
        kpis: snap.kpis,
        actions: snap.actions,
        rating: old.rating,
        comment: old.comment,
        notes: remapNotes(old, snap),
      },
    })
  })

  const deleteIds = existing.filter((e) => !freshOmaIds.has(e.omaId)).map((e) => e.id)

  return { create, update, deleteIds }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/review/snapshot.test.ts`
Expected: PASS (6 tests). If the "renumbers order" test fails, check that `snapshotOma` uses the loop index for `order`.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: clean (no boundary violation — `snapshot.ts` only imports `@/lib/omaForReview` and `@prisma/client`).

- [ ] **Step 6: Commit**

```bash
git add src/modules/review/snapshot.ts tests/review/snapshot.test.ts
git commit -m "feat(review): snapshot buildItems + mergeRefresh"
```

---

### Task 6: `openSelection.ts` — batch-open idempotency

**Files:**
- Create: `src/modules/review/openSelection.ts`
- Test: `tests/review/openSelection.test.ts`

**Interfaces:**
- Produces: `subjectsToOpen(eligibleSubjectIds: string[], existingReviewSubjectIds: string[]): string[]` — the eligible ids with no existing review, order preserved, de-duplicated.

- [ ] **Step 1: Write the failing test**

`tests/review/openSelection.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { subjectsToOpen } from "@/modules/review/openSelection"

describe("subjectsToOpen", () => {
  it("returns eligible subjects that have no review yet, in order", () => {
    expect(subjectsToOpen(["a", "b", "c"], ["b"])).toEqual(["a", "c"])
  })
  it("returns nothing when everyone already has a review", () => {
    expect(subjectsToOpen(["a", "b"], ["a", "b", "x"])).toEqual([])
  })
  it("de-duplicates the eligible list", () => {
    expect(subjectsToOpen(["a", "a", "b"], [])).toEqual(["a", "b"])
  })
  it("is empty when there are no eligible subjects", () => {
    expect(subjectsToOpen([], ["a"])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/review/openSelection.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/modules/review/openSelection.ts`**

```ts
// Which subjects still need a review created for a period. Pure — the DB queries
// for eligibility and for existing reviews live in the batchOpen action.
export function subjectsToOpen(
  eligibleSubjectIds: string[],
  existingReviewSubjectIds: string[],
): string[] {
  const have = new Set(existingReviewSubjectIds)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of eligibleSubjectIds) {
    if (have.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/review/openSelection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/review/openSelection.ts tests/review/openSelection.test.ts
git commit -m "feat(review): subjectsToOpen selection"
```

---

### Task 7: `authz.ts` — the permission table

**Files:**
- Create: `src/modules/review/authz.ts`
- Test: `tests/review/authz.test.ts`

**Interfaces:**
- Consumes: `SessionUser` from `@/types`; `ReviewStatus` from `@prisma/client`.
- Produces:
  - `type ReviewAuthShape = { subjectId: string; subject: { managerId: string | null }; scorerId: string; status: ReviewStatus }`
  - `canBatchOpen(u: SessionUser): boolean`
  - `canOpenAdHocFor(u: SessionUser, subject: { id: string; managerId: string | null }): boolean`
  - `canScore(u: SessionUser, r: ReviewAuthShape): boolean` — covers score/comment/note/refresh/complete/reopen
  - `canReassignScorer(u: SessionUser): boolean`
  - `canViewScorecard(u: SessionUser, r: ReviewAuthShape): boolean`
  - `canDeleteReview(u: SessionUser): boolean`

- [ ] **Step 1: Write the failing test**

`tests/review/authz.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  canBatchOpen,
  canDeleteReview,
  canOpenAdHocFor,
  canReassignScorer,
  canScore,
  canViewScorecard,
  type ReviewAuthShape,
} from "@/modules/review/authz"
import type { SessionUser } from "@/types"

const admin: SessionUser = { id: "admin", name: "A", role: "ADMIN", businessUnitId: null, managerId: null }
const mgr: SessionUser = { id: "mgr", name: "M", role: "MANAGER", businessUnitId: "bu1", managerId: "boss" }
const other: SessionUser = { id: "mgr2", name: "M2", role: "MANAGER", businessUnitId: "bu1", managerId: "boss" }
const user: SessionUser = { id: "u1", name: "U", role: "USER", businessUnitId: "bu1", managerId: "mgr" }

const openReview: ReviewAuthShape = {
  subjectId: "u1",
  subject: { managerId: "mgr" },
  scorerId: "mgr",
  status: "OPEN",
}
const completed: ReviewAuthShape = { ...openReview, status: "COMPLETED" }

describe("canBatchOpen", () => {
  it("admin only", () => {
    expect(canBatchOpen(admin)).toBe(true)
    expect(canBatchOpen(mgr)).toBe(false)
    expect(canBatchOpen(user)).toBe(false)
  })
})

describe("canOpenAdHocFor", () => {
  it("admin: anyone", () => expect(canOpenAdHocFor(admin, { id: "x", managerId: null })).toBe(true))
  it("manager: only their own team", () => {
    expect(canOpenAdHocFor(mgr, { id: "u1", managerId: "mgr" })).toBe(true)
    expect(canOpenAdHocFor(mgr, { id: "u2", managerId: "other" })).toBe(false)
  })
  it("user: never", () => expect(canOpenAdHocFor(user, { id: "u1", managerId: "mgr" })).toBe(false))
})

describe("canScore", () => {
  it("admin: any review", () => expect(canScore(admin, openReview)).toBe(true))
  it("manager: only where they are the scorer", () => {
    expect(canScore(mgr, openReview)).toBe(true)
    expect(canScore(other, openReview)).toBe(false)
  })
  it("user: never", () => expect(canScore(user, openReview)).toBe(false))
  it("still true on a completed review (needed for reopen)", () =>
    expect(canScore(mgr, completed)).toBe(true))
})

describe("canViewScorecard", () => {
  it("admin: always", () => {
    expect(canViewScorecard(admin, openReview)).toBe(true)
    expect(canViewScorecard(admin, completed)).toBe(true)
  })
  it("scorer: always", () => expect(canViewScorecard(mgr, openReview)).toBe(true))
  it("a manager who manages the subject but is not the scorer: always", () => {
    const r: ReviewAuthShape = { ...openReview, scorerId: "admin" }
    expect(canViewScorecard(mgr, r)).toBe(true)
  })
  it("subject: only their own AND only once completed", () => {
    expect(canViewScorecard(user, openReview)).toBe(false)
    expect(canViewScorecard(user, completed)).toBe(true)
  })
  it("an unrelated user: never", () => {
    const stranger: SessionUser = { ...user, id: "u9" }
    expect(canViewScorecard(stranger, completed)).toBe(false)
  })
})

describe("canReassignScorer / canDeleteReview", () => {
  it("admin only", () => {
    expect(canReassignScorer(admin)).toBe(true)
    expect(canReassignScorer(mgr)).toBe(false)
    expect(canDeleteReview(admin)).toBe(true)
    expect(canDeleteReview(mgr)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/review/authz.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/modules/review/authz.ts`**

```ts
import type { ReviewStatus } from "@prisma/client"
import type { SessionUser } from "@/types"

export type ReviewAuthShape = {
  subjectId: string
  subject: { managerId: string | null }
  scorerId: string
  status: ReviewStatus
}

function managesSubject(u: SessionUser, r: ReviewAuthShape): boolean {
  return r.subject.managerId !== null && r.subject.managerId === u.id
}

export function canBatchOpen(u: SessionUser): boolean {
  return u.role === "ADMIN"
}

export function canOpenAdHocFor(
  u: SessionUser,
  subject: { id: string; managerId: string | null },
): boolean {
  if (u.role === "ADMIN") return true
  if (u.role === "MANAGER") return subject.managerId !== null && subject.managerId === u.id
  return false
}

// score / comment / note / refresh / complete / reopen
export function canScore(u: SessionUser, r: ReviewAuthShape): boolean {
  if (u.role === "ADMIN") return true
  return r.scorerId === u.id
}

export function canReassignScorer(u: SessionUser): boolean {
  return u.role === "ADMIN"
}

export function canViewScorecard(u: SessionUser, r: ReviewAuthShape): boolean {
  if (u.role === "ADMIN") return true
  if (r.scorerId === u.id) return true
  if (managesSubject(u, r)) return true
  if (r.subjectId === u.id) return r.status === "COMPLETED"
  return false
}

export function canDeleteReview(u: SessionUser): boolean {
  return u.role === "ADMIN"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/review/authz.test.ts`
Expected: PASS (16 assertions across the describes).

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: all green (69 existing + new review tests).

```bash
git add src/modules/review/authz.ts tests/review/authz.test.ts
git commit -m "feat(review): authz permission table"
```

---

### Task 8: Ad-hoc open + the scorecard read view (R2)

**Files:**
- Create: `src/modules/review/queries.ts`
- Create: `src/modules/review/actions/open.ts`
- Create: `src/modules/review/components/PersonReviewLink.tsx`
- Create: `src/app/(app)/review/[reviewId]/page.tsx`
- Modify: `src/app/(app)/person/[userId]/page.tsx` (one import + one element)
- Test: none new (pure logic already covered); manual verification

**Interfaces:**
- Consumes: `getOmasForReview` (Task 3), `buildItems` (Task 5), `canOpenAdHocFor` / `canViewScorecard` (Task 7), `scoring` helpers (Task 4).
- Produces:
  - `getReview(reviewId: string)` → `Review & { items: ReviewItem[]; subject: {...}; period: {...} }` or `null`
  - `findReviewIdFor(subjectId: string, periodId: string): Promise<string | null>`
  - server action `openAdHocReview(subjectId: string, periodId: string): Promise<void>` — redirects to `/review/<id>`
  - `<PersonReviewLink subjectId periodId periodLabel />` — server component

- [ ] **Step 1: Write `src/modules/review/queries.ts`**

```ts
import { db } from "@/lib/db"

export async function getReview(reviewId: string) {
  return db.review.findUnique({
    where: { id: reviewId },
    include: {
      subject: { select: { id: true, name: true, managerId: true, businessUnit: { select: { name: true } } } },
      scorer: { select: { id: true, name: true } },
      period: { select: { id: true, label: true, shortLabel: true } },
      items: { orderBy: { order: "asc" } },
    },
  })
}

export async function findReviewIdFor(subjectId: string, periodId: string): Promise<string | null> {
  const r = await db.review.findUnique({
    where: { subjectId_periodId: { subjectId, periodId } },
    select: { id: true },
  })
  return r?.id ?? null
}
```

- [ ] **Step 2: Write `src/modules/review/actions/open.ts`**

```ts
"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { getOmasForReview } from "@/lib/omaForReview"
import { canOpenAdHocFor } from "@/modules/review/authz"
import { buildItems } from "@/modules/review/snapshot"
import type { Prisma as PrismaNS } from "@prisma/client"

export async function openAdHocReview(subjectId: string, periodId: string): Promise<void> {
  const viewer = await getSessionUser()
  const subject = await db.user.findUniqueOrThrow({
    where: { id: subjectId },
    select: { id: true, managerId: true },
  })
  if (!canOpenAdHocFor(viewer, subject)) throw new Error("Not allowed")

  const period = await db.period.findUniqueOrThrow({
    where: { id: periodId },
    select: { id: true },
  })

  const omas = await getOmasForReview(subjectId, periodId)
  if (omas.length === 0) throw new Error("This person has no OMAs to review this period.")

  const items = buildItems(omas)
  const scorerId = subject.managerId ?? viewer.id

  let review
  try {
    review = await withDbRetry(() =>
      db.review.create({
        data: {
          subjectId,
          scorerId,
          periodId: period.id,
          createdById: viewer.id,
          items: {
            create: items.map((it) => ({
              omaId: it.omaId,
              order: it.order,
              sequence: it.sequence,
              title: it.title,
              outcome: it.outcome,
              kpis: it.kpis as unknown as PrismaNS.InputJsonValue,
              actions: it.actions as unknown as PrismaNS.InputJsonValue,
            })),
          },
        },
      }),
    )
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("A review already exists for this person and period.")
    }
    throw e
  }

  revalidatePath(`/person/${subjectId}`)
  revalidatePath("/review")
  redirect(`/review/${review.id}`)
}
```

- [ ] **Step 3: Write `src/modules/review/components/PersonReviewLink.tsx`**

```tsx
import Link from "next/link"
import { getSessionUser } from "@/lib/session"
import { db } from "@/lib/db"
import { canOpenAdHocFor } from "@/modules/review/authz"
import { findReviewIdFor } from "@/modules/review/queries"
import { openAdHocReview } from "@/modules/review/actions/open"

// Small entry point on the person page. Shows a link to the existing review for
// this person+period, or a "Start review" button for a manager/admin.
export async function PersonReviewLink({
  subjectId,
  periodId,
  periodLabel,
}: {
  subjectId: string
  periodId: string
  periodLabel: string
}) {
  const viewer = await getSessionUser()
  const reviewId = await findReviewIdFor(subjectId, periodId)

  if (reviewId) {
    return (
      <Link
        href={`/review/${reviewId}`}
        className="text-sm font-semibold text-mfa-red hover:underline"
      >
        Review · {periodLabel} ›
      </Link>
    )
  }

  const subject = await db.user.findUnique({
    where: { id: subjectId },
    select: { id: true, managerId: true },
  })
  if (!subject || !canOpenAdHocFor(viewer, subject)) return null

  return (
    <form action={openAdHocReview.bind(null, subjectId, periodId)}>
      <button className="text-sm font-semibold text-mfa-red hover:underline">
        Start review · {periodLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Write `src/app/(app)/review/[reviewId]/page.tsx` (read-only scorecard)**

```tsx
import { notFound, redirect } from "next/navigation"
import { BackButton } from "@/components/BackButton"
import { PageTitle } from "@/components/PageTitle"
import { formatMetricValue } from "@/lib/progress"
import { getSessionUser } from "@/lib/session"
import { getReview } from "@/modules/review/queries"
import { canViewScorecard } from "@/modules/review/authz"
import { finalScore, ratingLabel, runningAverage } from "@/modules/review/scoring"
import type { SnapshotAction, SnapshotKpi } from "@/modules/review/snapshot"

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export default async function ScorecardPage({ params }: { params: { reviewId: string } }) {
  const review = await getReview(params.reviewId)
  if (!review) notFound()
  const viewer = await getSessionUser()
  const shape = {
    subjectId: review.subjectId,
    subject: { managerId: review.subject.managerId },
    scorerId: review.scorerId,
    status: review.status,
  }
  if (!canViewScorecard(viewer, shape)) redirect("/review")

  const items = review.items.map((i) => ({ rating: i.rating }))
  const score = review.status === "COMPLETED" ? review.finalScore : runningAverage(items)
  const scoreLabel = review.status === "COMPLETED" ? "Final score" : "Average so far"

  return (
    <main>
      <BackButton />
      <div className="mt-3">
        <PageTitle>{review.subject.name} — OMA Scorecard</PageTitle>
        <p className="mt-1 text-sm font-semibold text-mfa-muted">
          {review.period.label} · {review.status === "COMPLETED" ? "Completed" : "In review"}
          {review.reviewDate ? ` · ${fmtDate(review.reviewDate)}` : ""}
        </p>
      </div>

      <div className="mt-10 space-y-10">
        {review.items.map((item) => {
          const kpis = item.kpis as unknown as SnapshotKpi[]
          const actions = item.actions as unknown as SnapshotAction[]
          return (
            <section key={item.id} className="rounded-2xl border-2 border-mfa-track">
              <div className="bg-mfa-red px-5 py-3 text-white">
                <span className="rounded bg-white/15 px-2 py-0.5 text-sm font-bold">
                  OMA {item.sequence}
                </span>
                <span className="ml-3 text-lg font-bold">{item.title}</span>
              </div>

              <div className="border-b border-mfa-track px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                  Outcome
                </p>
                <p className="mt-1">{item.outcome}</p>
              </div>

              <div className="border-b border-mfa-track px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                  Metric / KPI
                </p>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {kpis.map((k) => (
                      <tr key={k.ref} className="border-t border-mfa-track first:border-t-0">
                        <td className="py-2 font-semibold">{k.measure}</td>
                        <td className="py-2">Target {formatMetricValue(k.target, k.unit)}</td>
                        <td className="py-2">Current {formatMetricValue(k.current, k.unit)}</td>
                      </tr>
                    ))}
                    {kpis.length === 0 && (
                      <tr><td className="py-2 text-mfa-muted">No KPI.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-b border-mfa-track px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                  Actions
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {actions.map((a) => (
                    <li key={a.ref} className={a.completed ? "text-mfa-muted line-through" : ""}>
                      {a.description}
                      {a.dueDate ? ` — due ${fmtDate(a.dueDate)}` : ""}
                    </li>
                  ))}
                  {actions.length === 0 && <li className="text-mfa-muted">No actions.</li>}
                </ul>
              </div>

              <div className="px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">
                  Rating
                </p>
                <p className="mt-1 font-semibold">
                  {item.rating ? ratingLabel(item.rating) : <span className="text-mfa-muted">Not yet rated</span>}
                </p>
                {item.comment && <p className="mt-2 text-sm">{item.comment}</p>}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-10 rounded-xl bg-mfa-panel px-5 py-4">
        <span className="text-sm font-semibold text-mfa-muted">{scoreLabel}: </span>
        <span className="text-lg font-bold">
          {score === null || score === undefined ? "—" : `${score} / 3`}
        </span>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Wire `PersonReviewLink` into the person page**

In `src/app/(app)/person/[userId]/page.tsx`, add the import near the other imports:

```tsx
import { PersonReviewLink } from "@/modules/review/components/PersonReviewLink"
```

Then, inside the `<div className="mt-3">` block that holds `<PageTitle>`, add the link element right after the `</PageTitle>` line:

```tsx
      <div className="mt-3">
        <PageTitle>{person.name} — OMAs</PageTitle>
        <div className="mt-2">
          <PersonReviewLink subjectId={person.id} periodId={periodId} periodLabel={period.label} />
        </div>
      </div>
```

- [ ] **Step 6: Typecheck, lint, existing suite**

Run: `npx tsc --noEmit && npx next lint && npm test`
Expected: all clean; 69 + review unit tests green. If lint flags `PersonReviewLink` importing from `@/lib/...`, confirm it only imports `@/lib/session` and `@/lib/db` (both allowed).

- [ ] **Step 7: Manual verification**

Restart dev server (`pkill -f "next dev"; npm run dev`). As the dev-bypass admin:
1. Open a person who has ≥1 OMA in the active period. Confirm "Start review · H2 2026" shows under the title.
2. Click it. Confirm redirect to `/review/<id>`, the scorecard renders every OMA read-only with outcome / KPIs / actions, "Not yet rated" per OMA, "Average so far: —".
3. Reload the person page. Confirm the link now reads "Review · H2 2026 ›" and points to the same scorecard.
4. Try `openAdHocReview` again for the same person (navigate back, the button is gone — good). Via the URL there's no second entry; the `@@unique` covers direct calls.

- [ ] **Step 8: Commit**

```bash
git add src/modules/review src/app/(app)/review "src/app/(app)/person/[userId]/page.tsx"
git commit -m "feat(review): ad-hoc open + read-only scorecard (R2)"
```

---

### Task 9: Scoring interactions on the scorecard

**Files:**
- Create: `src/modules/review/actions/score.ts`
- Create: `src/modules/review/components/RatingControl.tsx`
- Create: `src/modules/review/components/ItemNotes.tsx`
- Modify: `src/app/(app)/review/[reviewId]/page.tsx` (render the controls when the viewer can score)
- Test: none new; manual verification

**Interfaces:**
- Consumes: `canScore` (Task 7), `getReview` (Task 8), `ItemNote` type (Task 5).
- Produces server actions (all validate session + `canScore`, all require `status === "OPEN"`):
  - `setItemRating(reviewId: string, itemId: string, rating: "BELOW" | "MEETS" | "EXCEEDS"): Promise<void>`
  - `setItemComment(reviewId: string, itemId: string, comment: string): Promise<void>`
  - `setItemNote(reviewId: string, itemId: string, ref: string, kind: "kpi" | "action", text: string): Promise<void>` — empty `text` removes the note

- [ ] **Step 1: Write `src/modules/review/actions/score.ts`**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { Prisma as PrismaNS } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { canScore } from "@/modules/review/authz"
import type { ItemNote } from "@/modules/review/snapshot"

async function loadOpenItemForScorer(reviewId: string, itemId: string) {
  const viewer = await getSessionUser()
  const review = await db.review.findUniqueOrThrow({
    where: { id: reviewId },
    select: {
      status: true,
      scorerId: true,
      subjectId: true,
      subject: { select: { managerId: true } },
      items: { where: { id: itemId }, select: { id: true, notes: true } },
    },
  })
  const shape = {
    subjectId: review.subjectId,
    subject: { managerId: review.subject.managerId },
    scorerId: review.scorerId,
    status: review.status,
  }
  if (!canScore(viewer, shape)) throw new Error("Not allowed")
  if (review.status !== "OPEN") throw new Error("This review is completed.")
  const item = review.items[0]
  if (!item) throw new Error("Unknown scorecard item.")
  return item
}

const ratingSchema = z.enum(["BELOW", "MEETS", "EXCEEDS"])

export async function setItemRating(
  reviewId: string,
  itemId: string,
  rating: z.infer<typeof ratingSchema>,
): Promise<void> {
  ratingSchema.parse(rating)
  await loadOpenItemForScorer(reviewId, itemId)
  await withDbRetry(() => db.reviewItem.update({ where: { id: itemId }, data: { rating } }))
  revalidatePath(`/review/${reviewId}`)
}

export async function setItemComment(
  reviewId: string,
  itemId: string,
  comment: string,
): Promise<void> {
  const clean = z.string().max(4000).parse(comment)
  await loadOpenItemForScorer(reviewId, itemId)
  await withDbRetry(() =>
    db.reviewItem.update({
      where: { id: itemId },
      data: { comment: clean.trim() || null },
    }),
  )
  revalidatePath(`/review/${reviewId}`)
}

export async function setItemNote(
  reviewId: string,
  itemId: string,
  ref: string,
  kind: "kpi" | "action",
  text: string,
): Promise<void> {
  const clean = z.string().max(2000).parse(text).trim()
  z.enum(["kpi", "action"]).parse(kind)
  const item = await loadOpenItemForScorer(reviewId, itemId)
  const notes = ((item.notes as unknown as ItemNote[]) ?? []).filter((n) => n.ref !== ref)
  if (clean) notes.push({ ref, kind, text: clean })
  await withDbRetry(() =>
    db.reviewItem.update({
      where: { id: itemId },
      data: { notes: notes as unknown as PrismaNS.InputJsonValue },
    }),
  )
  revalidatePath(`/review/${reviewId}`)
}
```

- [ ] **Step 2: Write `src/modules/review/components/RatingControl.tsx`**

```tsx
"use client"

import { useTransition } from "react"
import type { OmaRating } from "@prisma/client"
import { setItemRating } from "@/modules/review/actions/score"

const OPTIONS: { value: OmaRating; label: string }[] = [
  { value: "BELOW", label: "1 · Below" },
  { value: "MEETS", label: "2 · Meets" },
  { value: "EXCEEDS", label: "3 · Exceeds" },
]

export function RatingControl({
  reviewId,
  itemId,
  value,
}: {
  reviewId: string
  itemId: string
  value: OmaRating | null
}) {
  const [pending, start] = useTransition()
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-mfa-track">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={pending}
          onClick={() => start(() => setItemRating(reviewId, itemId, o.value))}
          className={`px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${
            value === o.value ? "bg-mfa-red text-white" : "text-mfa-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Write `src/modules/review/components/ItemNotes.tsx`**

```tsx
"use client"

import { useState, useTransition } from "react"
import { setItemComment, setItemNote } from "@/modules/review/actions/score"

export function CommentBox({
  reviewId,
  itemId,
  value,
}: {
  reviewId: string
  itemId: string
  value: string | null
}) {
  const [text, setText] = useState(value ?? "")
  const [pending, start] = useTransition()
  const dirty = text !== (value ?? "")
  return (
    <div className="mt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Comment on this OMA"
        className="w-full rounded border border-mfa-track px-3 py-2 text-sm"
      />
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => setItemComment(reviewId, itemId, text))}
          className="mt-1 rounded-full bg-mfa-red px-4 py-1 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save comment"}
        </button>
      )}
    </div>
  )
}

export function RowNote({
  reviewId,
  itemId,
  refId,
  kind,
  value,
}: {
  reviewId: string
  itemId: string
  refId: string
  kind: "kpi" | "action"
  value: string
}) {
  const [text, setText] = useState(value)
  const [pending, start] = useTransition()
  const dirty = text !== value
  return (
    <div className="mt-1 flex items-start gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note"
        className="flex-1 rounded border border-mfa-track px-2 py-1 text-xs"
      />
      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => setItemNote(reviewId, itemId, refId, kind, text))}
          className="rounded-full bg-mfa-red px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          Save
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Render the controls in the scorecard page when the viewer can score**

In `src/app/(app)/review/[reviewId]/page.tsx`:

Add imports:

```tsx
import { canScore, canViewScorecard } from "@/modules/review/authz"
import { RatingControl } from "@/modules/review/components/RatingControl"
import { CommentBox, RowNote } from "@/modules/review/components/ItemNotes"
import type { ItemNote } from "@/modules/review/snapshot"
```

After the `canViewScorecard` check, compute:

```tsx
  const mayScore = canScore(viewer, shape) && review.status === "OPEN"
```

In the KPI table row, after the three `<td>`s, when `mayScore` add a full-width note row beneath each KPI:

```tsx
{mayScore && (
  <tr>
    <td colSpan={3} className="pb-2">
      <RowNote
        reviewId={review.id}
        itemId={item.id}
        refId={k.ref}
        kind="kpi"
        value={(item.notes as unknown as ItemNote[])?.find((n) => n.ref === k.ref)?.text ?? ""}
      />
    </td>
  </tr>
)}
```

Do the same under each action `<li>` (wrap the action list item content so the `RowNote` sits beneath, `kind="action"`).

Replace the static Rating block with:

```tsx
<div className="px-5 py-4">
  <p className="text-xs font-semibold uppercase tracking-widest text-mfa-muted">Rating</p>
  {mayScore ? (
    <div className="mt-1">
      <RatingControl reviewId={review.id} itemId={item.id} value={item.rating} />
      <CommentBox reviewId={review.id} itemId={item.id} value={item.comment} />
    </div>
  ) : (
    <>
      <p className="mt-1 font-semibold">
        {item.rating ? ratingLabel(item.rating) : <span className="text-mfa-muted">Not yet rated</span>}
      </p>
      {item.comment && <p className="mt-2 text-sm">{item.comment}</p>}
    </>
  )}
</div>
```

- [ ] **Step 5: Typecheck, lint, existing suite**

Run: `npx tsc --noEmit && npx next lint && npm test`
Expected: clean; 69 + review unit tests green.

- [ ] **Step 6: Manual verification**

On the scorecard from Task 8, as admin:
1. Click "2 · Meets" on the first OMA — it highlights, "Average so far" updates to `2 / 3`.
2. Type a comment, click "Save comment" — reload, it persists and shows.
3. Add a note under a KPI, Save — reload, it persists in the input.
4. Clear a note's text, Save — reload, it's gone.

- [ ] **Step 7: Commit**

```bash
git add src/modules/review "src/app/(app)/review"
git commit -m "feat(review): rating, comment and note controls"
```

---

### Task 10: Lifecycle — refresh, complete, reopen, delete, reassign

**Files:**
- Create: `src/modules/review/actions/lifecycle.ts`
- Create: `src/modules/review/components/ScorecardFooter.tsx`
- Modify: `src/app/(app)/review/[reviewId]/page.tsx` (render the footer)
- Test: none new; manual verification

**Interfaces:**
- Consumes: `getOmasForReview` (Task 3), `mergeRefresh` (Task 5), `finalScore` / `canComplete` (Task 4), `canScore` / `canDeleteReview` / `canReassignScorer` (Task 7), `ExistingItem` type (Task 5).
- Produces server actions:
  - `refreshReview(reviewId: string): Promise<void>` — scorer, `OPEN` only
  - `completeReview(reviewId: string): Promise<void>` — scorer, `OPEN`, all items rated
  - `reopenReview(reviewId: string): Promise<void>` — scorer/admin, `COMPLETED` only
  - `deleteReview(reviewId: string): Promise<void>` — admin, redirects to `/review`
  - `reassignScorer(reviewId: string, newScorerId: string): Promise<void>` — admin

- [ ] **Step 1: Write `src/modules/review/actions/lifecycle.ts`**

```ts
"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import type { Prisma as PrismaNS } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { getOmasForReview } from "@/lib/omaForReview"
import { canDeleteReview, canReassignScorer, canScore } from "@/modules/review/authz"
import { mergeRefresh, type ExistingItem } from "@/modules/review/snapshot"
import { canComplete, finalScore } from "@/modules/review/scoring"

async function loadForScorer(reviewId: string) {
  const viewer = await getSessionUser()
  const review = await db.review.findUniqueOrThrow({
    where: { id: reviewId },
    include: {
      subject: { select: { managerId: true } },
      items: { orderBy: { order: "asc" } },
    },
  })
  const shape = {
    subjectId: review.subjectId,
    subject: { managerId: review.subject.managerId },
    scorerId: review.scorerId,
    status: review.status,
  }
  if (!canScore(viewer, shape)) throw new Error("Not allowed")
  return { viewer, review }
}

export async function refreshReview(reviewId: string): Promise<void> {
  const { review } = await loadForScorer(reviewId)
  if (review.status !== "OPEN") throw new Error("This review is completed.")

  const fresh = await getOmasForReview(review.subjectId, review.periodId)
  const existing: ExistingItem[] = review.items.map((i) => ({
    id: i.id,
    omaId: i.omaId,
    order: i.order,
    sequence: i.sequence,
    title: i.title,
    outcome: i.outcome,
    kpis: i.kpis as unknown as ExistingItem["kpis"],
    actions: i.actions as unknown as ExistingItem["actions"],
    rating: i.rating,
    comment: i.comment,
    notes: (i.notes as unknown as ExistingItem["notes"]) ?? [],
  }))

  const { create, update, deleteIds } = mergeRefresh(existing, fresh)

  const ops: PrismaNS.PrismaPromise<unknown>[] = []
  if (deleteIds.length) ops.push(db.reviewItem.deleteMany({ where: { id: { in: deleteIds } } }))
  for (const u of update) {
    ops.push(
      db.reviewItem.update({
        where: { id: u.id },
        data: {
          order: u.data.order,
          sequence: u.data.sequence,
          title: u.data.title,
          outcome: u.data.outcome,
          kpis: u.data.kpis as unknown as PrismaNS.InputJsonValue,
          actions: u.data.actions as unknown as PrismaNS.InputJsonValue,
          notes: u.data.notes as unknown as PrismaNS.InputJsonValue,
        },
      }),
    )
  }
  for (const c of create) {
    ops.push(
      db.reviewItem.create({
        data: {
          reviewId,
          omaId: c.omaId,
          order: c.order,
          sequence: c.sequence,
          title: c.title,
          outcome: c.outcome,
          kpis: c.kpis as unknown as PrismaNS.InputJsonValue,
          actions: c.actions as unknown as PrismaNS.InputJsonValue,
        },
      }),
    )
  }
  if (ops.length) await withDbRetry(() => db.$transaction(ops))
  revalidatePath(`/review/${reviewId}`)
}

export async function completeReview(reviewId: string): Promise<void> {
  const { review } = await loadForScorer(reviewId)
  if (review.status !== "OPEN") throw new Error("This review is already completed.")
  const items = review.items.map((i) => ({ rating: i.rating }))
  if (!canComplete(items)) throw new Error("Score every OMA before completing.")
  const now = new Date()
  await withDbRetry(() =>
    db.review.update({
      where: { id: reviewId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        reviewDate: now,
        finalScore: finalScore(items),
      },
    }),
  )
  revalidatePath(`/review/${reviewId}`)
  revalidatePath("/review")
}

export async function reopenReview(reviewId: string): Promise<void> {
  const { review } = await loadForScorer(reviewId)
  if (review.status !== "COMPLETED") throw new Error("This review is not completed.")
  await withDbRetry(() =>
    db.review.update({
      where: { id: reviewId },
      data: { status: "OPEN", completedAt: null, reviewDate: null, finalScore: null },
    }),
  )
  revalidatePath(`/review/${reviewId}`)
  revalidatePath("/review")
}

export async function deleteReview(reviewId: string): Promise<void> {
  const viewer = await getSessionUser()
  if (!canDeleteReview(viewer)) throw new Error("Not allowed")
  const review = await db.review.findUniqueOrThrow({
    where: { id: reviewId },
    select: { subjectId: true },
  })
  await withDbRetry(() => db.review.delete({ where: { id: reviewId } }))
  revalidatePath(`/person/${review.subjectId}`)
  revalidatePath("/review")
  redirect("/review")
}

export async function reassignScorer(reviewId: string, newScorerId: string): Promise<void> {
  const viewer = await getSessionUser()
  if (!canReassignScorer(viewer)) throw new Error("Not allowed")
  await db.user.findUniqueOrThrow({ where: { id: newScorerId }, select: { id: true } })
  try {
    await withDbRetry(() =>
      db.review.update({ where: { id: reviewId }, data: { scorerId: newScorerId } }),
    )
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) throw new Error("Could not reassign.")
    throw e
  }
  revalidatePath(`/review/${reviewId}`)
}
```

- [ ] **Step 2: Write `src/modules/review/components/ScorecardFooter.tsx`**

```tsx
"use client"

import { useTransition } from "react"
import { completeReview, refreshReview, reopenReview } from "@/modules/review/actions/lifecycle"

export function ScorecardFooter({
  reviewId,
  status,
  canScore,
  canComplete,
}: {
  reviewId: string
  status: "OPEN" | "COMPLETED"
  canScore: boolean
  canComplete: boolean
}) {
  const [pending, start] = useTransition()
  if (!canScore) return null

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {status === "OPEN" && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => refreshReview(reviewId))}
            className="rounded-full border border-mfa-red px-5 py-2 text-sm font-semibold text-mfa-red disabled:opacity-60"
          >
            Refresh from current OMAs
          </button>
          <button
            type="button"
            disabled={pending || !canComplete}
            onClick={() => start(() => completeReview(reviewId))}
            title={canComplete ? "" : "Score every OMA first"}
            className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-40"
          >
            Complete review
          </button>
        </>
      )}
      {status === "COMPLETED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => reopenReview(reviewId))}
          className="rounded-full border border-mfa-red px-5 py-2 text-sm font-semibold text-mfa-red disabled:opacity-60"
        >
          Reopen
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Render the footer in the scorecard page**

In `src/app/(app)/review/[reviewId]/page.tsx`, import:

```tsx
import { ScorecardFooter } from "@/modules/review/components/ScorecardFooter"
import { canComplete } from "@/modules/review/scoring"
```

Below the score summary box, add:

```tsx
<ScorecardFooter
  reviewId={review.id}
  status={review.status}
  canScore={canScore(viewer, shape)}
  canComplete={canComplete(review.items.map((i) => ({ rating: i.rating })))}
/>
```

- [ ] **Step 4: Typecheck, lint, existing suite**

Run: `npx tsc --noEmit && npx next lint && npm test`
Expected: clean; all green.

- [ ] **Step 5: Manual verification**

On an OPEN scorecard as admin:
1. With an unrated OMA, "Complete review" is disabled. Rate all OMAs → it enables.
2. Click "Refresh from current OMAs" with no OMA changes → page reloads unchanged, ratings kept.
3. In another tab, edit one of the person's OMAs (change the outcome). Back on the scorecard, click Refresh → the outcome updates, the rating is still there.
4. Click "Complete review" → status becomes "Completed", review date shows, "Final score: X / 3", controls become read-only, "Reopen" appears.
5. Open the app as the subject (temporarily set `AUTH_DEV_BYPASS` to their email, restart) → `/review` shows the scorecard under "Your scorecards" (built next task) — for now visit `/review/<id>` directly and confirm it renders read-only. Set `AUTH_DEV_BYPASS` back.
6. As admin, "Reopen" → status back to OPEN; as the subject, `/review/<id>` now redirects to `/review`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/review "src/app/(app)/review"
git commit -m "feat(review): refresh, complete, reopen, delete, reassign"
```

---

### Task 11: Review list (R1) + header link

**Files:**
- Modify: `src/modules/review/queries.ts` (add list queries)
- Create: `src/app/(app)/review/page.tsx`
- Modify: `src/components/AppHeader.tsx` (one link)
- Test: none new; manual verification

**Interfaces:**
- Produces:
  - `getReviewsToScore(scorerId: string)` → `{ id, subjectName, periodLabel, rated: number, total: number }[]` — `status OPEN`, ordered by `createdAt` desc
  - `getMyScorecards(subjectId: string)` → `{ id, periodLabel, finalScore, reviewDate }[]` — `status COMPLETED`
  - `getAllReviews(filter?: { periodId?: string; status?: ReviewStatus })` → rows for the admin table

- [ ] **Step 1: Add the list queries to `src/modules/review/queries.ts`**

```ts
import type { ReviewStatus } from "@prisma/client"

export async function getReviewsToScore(scorerId: string) {
  const rows = await db.review.findMany({
    where: { scorerId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: { select: { name: true } },
      period: { select: { label: true } },
      items: { select: { rating: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    subjectName: r.subject.name,
    periodLabel: r.period.label,
    rated: r.items.filter((i) => i.rating !== null).length,
    total: r.items.length,
  }))
}

export async function getMyScorecards(subjectId: string) {
  const rows = await db.review.findMany({
    where: { subjectId, status: "COMPLETED" },
    orderBy: { reviewDate: "desc" },
    select: { id: true, finalScore: true, reviewDate: true, period: { select: { label: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.period.label,
    finalScore: r.finalScore,
    reviewDate: r.reviewDate,
  }))
}

export async function getAllReviews(filter: { periodId?: string; status?: ReviewStatus } = {}) {
  const rows = await db.review.findMany({
    where: {
      periodId: filter.periodId,
      status: filter.status,
    },
    orderBy: [{ period: { startDate: "desc" } }, { subject: { name: "asc" } }],
    select: {
      id: true,
      status: true,
      finalScore: true,
      subject: { select: { name: true } },
      scorer: { select: { name: true } },
      period: { select: { label: true } },
      items: { select: { rating: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    finalScore: r.finalScore,
    subjectName: r.subject.name,
    scorerName: r.scorer.name,
    periodLabel: r.period.label,
    rated: r.items.filter((i) => i.rating !== null).length,
    total: r.items.length,
  }))
}
```

- [ ] **Step 2: Write `src/app/(app)/review/page.tsx`**

```tsx
import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { PageTitle } from "@/components/PageTitle"
import { getSessionUser } from "@/lib/session"
import { getMyScorecards, getReviewsToScore } from "@/modules/review/queries"

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"
}

export default async function ReviewListPage() {
  const viewer = await getSessionUser()
  const [toScore, mine] = await Promise.all([
    viewer.role === "USER" ? Promise.resolve([]) : getReviewsToScore(viewer.id),
    getMyScorecards(viewer.id),
  ])

  return (
    <main>
      <BackButton />
      <div className="mt-3">
        <PageTitle>Reviews</PageTitle>
      </div>

      {viewer.role !== "USER" && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-mfa-muted">
            Reviews to score
          </h2>
          <div className="mt-3 space-y-2">
            {toScore.length === 0 && <p className="text-sm text-mfa-muted">Nothing to score.</p>}
            {toScore.map((r) => (
              <Link
                key={r.id}
                href={`/review/${r.id}`}
                className="flex items-center gap-3 rounded-xl bg-mfa-panel px-5 py-3 hover:bg-mfa-track/50"
              >
                <span className="flex-1 font-semibold">{r.subjectName}</span>
                <span className="text-sm text-mfa-muted">{r.periodLabel}</span>
                <span className="text-sm font-semibold">
                  {r.rated}/{r.total} scored
                </span>
                <span className="text-mfa-muted">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-mfa-muted">
          Your scorecards
        </h2>
        <div className="mt-3 space-y-2">
          {mine.length === 0 && <p className="text-sm text-mfa-muted">No completed reviews yet.</p>}
          {mine.map((r) => (
            <Link
              key={r.id}
              href={`/review/${r.id}`}
              className="flex items-center gap-3 rounded-xl bg-mfa-panel px-5 py-3 hover:bg-mfa-track/50"
            >
              <span className="flex-1 font-semibold">{r.periodLabel}</span>
              <span className="text-sm text-mfa-muted">{fmtDate(r.reviewDate)}</span>
              <span className="text-sm font-semibold">
                {r.finalScore === null ? "—" : `${r.finalScore} / 3`}
              </span>
              <span className="text-mfa-muted">›</span>
            </Link>
          ))}
        </div>
      </section>

      {viewer.role === "ADMIN" && (
        <div className="mt-10">
          <Link href="/admin/reviews" className="text-sm font-semibold text-mfa-red hover:underline">
            Admin: open & track reviews by period ›
          </Link>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Add the "Reviews" link to `src/components/AppHeader.tsx`**

Between the `{user.role === "ADMIN" && (...)}` Admin link block and `<PeriodSelector .../>`, add:

```tsx
        <Link
          href="/review"
          className="text-sm font-semibold text-mfa-white/80 hover:text-mfa-white"
        >
          Reviews
        </Link>
```

- [ ] **Step 4: Typecheck, lint, existing suite**

Run: `npx tsc --noEmit && npx next lint && npm test`
Expected: clean; all green. (`AppHeader.tsx` is not in the boundary override list, and it imports the review query — that's allowed; only the *listed OMA files* are blocked from importing review.)

- [ ] **Step 5: Manual verification**

1. Header shows "Reviews". Click it → `/review`.
2. As admin: "Reviews to score" lists the open reviews where you're the scorer; each shows `n/m scored`.
3. Complete one (from R2), come back → it moves out of "to score"; if you're also its subject it appears under "Your scorecards" with the score.
4. As a USER (dev-bypass): only "Your scorecards" shows, no "to score" section, no admin link.

- [ ] **Step 6: Commit**

```bash
git add src/modules/review "src/app/(app)/review/page.tsx" src/components/AppHeader.tsx
git commit -m "feat(review): review list (R1) + header link"
```

---

### Task 12: Admin batch-open (R3)

**Files:**
- Modify: `src/modules/review/queries.ts` (period overview query)
- Create: `src/modules/review/actions/batch.ts`
- Create: `src/modules/review/components/BatchOpenButton.tsx`
- Create: `src/app/(app)/admin/reviews/page.tsx`
- Test: none new; manual verification (idempotency logic is unit-tested in Task 6)

**Interfaces:**
- Consumes: `subjectsToOpen` (Task 6), `getOmasForReview` (Task 3), `buildItems` (Task 5), `canBatchOpen` (Task 7), `getAllReviews` (Task 11).
- Produces:
  - `getPeriodReviewOverview(periodId)` → `{ eligible: number; reviews: number; completed: number }`
  - server action `batchOpenReviews(periodId: string): Promise<void>` — admin only

- [ ] **Step 1: Add `getPeriodReviewOverview` and an eligibility helper to `queries.ts`**

```ts
// Active users with at least one OMA in the period — the batch-open candidates.
export async function getEligibleSubjectIds(periodId: string): Promise<string[]> {
  const users = await db.user.findMany({
    where: { active: true, omas: { some: { periodId } } },
    orderBy: { name: "asc" },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

export async function getPeriodReviewOverview(periodId: string) {
  const [eligible, reviews, completed] = await Promise.all([
    getEligibleSubjectIds(periodId).then((ids) => ids.length),
    db.review.count({ where: { periodId } }),
    db.review.count({ where: { periodId, status: "COMPLETED" } }),
  ])
  return { eligible, reviews, completed }
}
```

- [ ] **Step 2: Write `src/modules/review/actions/batch.ts`**

```ts
"use server"

import { revalidatePath } from "next/cache"
import type { Prisma as PrismaNS } from "@prisma/client"
import { db } from "@/lib/db"
import { withDbRetry } from "@/lib/dbRetry"
import { getSessionUser } from "@/lib/session"
import { getOmasForReview } from "@/lib/omaForReview"
import { canBatchOpen } from "@/modules/review/authz"
import { buildItems } from "@/modules/review/snapshot"
import { subjectsToOpen } from "@/modules/review/openSelection"
import { getEligibleSubjectIds } from "@/modules/review/queries"

export async function batchOpenReviews(periodId: string): Promise<void> {
  const viewer = await getSessionUser()
  if (!canBatchOpen(viewer)) throw new Error("Not allowed")
  await db.period.findUniqueOrThrow({ where: { id: periodId }, select: { id: true } })

  const [eligible, existing] = await Promise.all([
    getEligibleSubjectIds(periodId),
    db.review.findMany({ where: { periodId }, select: { subjectId: true } }),
  ])
  const targets = subjectsToOpen(
    eligible,
    existing.map((r) => r.subjectId),
  )

  for (const subjectId of targets) {
    const subject = await db.user.findUniqueOrThrow({
      where: { id: subjectId },
      select: { managerId: true },
    })
    const omas = await getOmasForReview(subjectId, periodId)
    if (omas.length === 0) continue // guard: eligibility already implies >=1, belt & braces
    const items = buildItems(omas)
    await withDbRetry(() =>
      db.review.create({
        data: {
          subjectId,
          scorerId: subject.managerId ?? viewer.id,
          periodId,
          createdById: viewer.id,
          items: {
            create: items.map((it) => ({
              omaId: it.omaId,
              order: it.order,
              sequence: it.sequence,
              title: it.title,
              outcome: it.outcome,
              kpis: it.kpis as unknown as PrismaNS.InputJsonValue,
              actions: it.actions as unknown as PrismaNS.InputJsonValue,
            })),
          },
        },
      }),
    )
  }

  revalidatePath("/admin/reviews")
  revalidatePath("/review")
}
```

- [ ] **Step 3: Write `src/modules/review/components/BatchOpenButton.tsx`**

```tsx
"use client"

import { useTransition } from "react"
import { batchOpenReviews } from "@/modules/review/actions/batch"

export function BatchOpenButton({
  periodId,
  periodLabel,
  pending: alreadyOpen,
}: {
  periodId: string
  periodLabel: string
  pending: number
}) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending || alreadyOpen === 0}
      onClick={() => {
        if (window.confirm(`Open reviews for ${alreadyOpen} person(s) in ${periodLabel}?`)) {
          start(() => batchOpenReviews(periodId))
        }
      }}
      className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-40"
    >
      {pending ? "Opening…" : `Open ${alreadyOpen} review(s) for ${periodLabel}`}
    </button>
  )
}
```

- [ ] **Step 4: Write `src/app/(app)/admin/reviews/page.tsx`**

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"
import { BackButton } from "@/components/BackButton"
import { PageTitle } from "@/components/PageTitle"
import { getSessionUser } from "@/lib/session"
import { listPeriods, resolvePeriodId } from "@/lib/periods"
import { ratingLabel } from "@/modules/review/scoring"
import {
  getAllReviews,
  getEligibleSubjectIds,
  getPeriodReviewOverview,
} from "@/modules/review/queries"
import { BatchOpenButton } from "@/modules/review/components/BatchOpenButton"

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: { period?: string }
}) {
  const viewer = await getSessionUser()
  if (viewer.role !== "ADMIN") redirect("/")

  const periods = await listPeriods()
  const periodId = await resolvePeriodId(searchParams.period)
  const periodLabel = periods.find((p) => p.id === periodId)?.label ?? ""

  const [overview, eligibleIds, rows] = await Promise.all([
    getPeriodReviewOverview(periodId),
    getEligibleSubjectIds(periodId),
    getAllReviews({ periodId }),
  ])
  const notYetOpened = eligibleIds.length - overview.reviews

  return (
    <main>
      <BackButton />
      <div className="mt-3">
        <PageTitle>Reviews — Admin</PageTitle>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`/admin/reviews?period=${p.id}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              p.id === periodId ? "bg-mfa-red text-white" : "bg-mfa-panel text-mfa-muted"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-mfa-panel px-5 py-4 text-sm">
        <p>
          <span className="font-semibold">{overview.eligible}</span> people with OMAs ·{" "}
          <span className="font-semibold">{overview.reviews}</span> reviews ·{" "}
          <span className="font-semibold">{overview.completed}</span> completed
        </p>
        <div className="mt-3">
          <BatchOpenButton
            periodId={periodId}
            periodLabel={periodLabel}
            pending={Math.max(0, notYetOpened)}
          />
        </div>
      </div>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-mfa-track text-left text-xs uppercase tracking-widest text-mfa-muted">
            <th className="py-2">Person</th>
            <th className="py-2">Scorer</th>
            <th className="py-2">Status</th>
            <th className="py-2">Score</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-mfa-track">
              <td className="py-2 font-semibold">{r.subjectName}</td>
              <td className="py-2 text-mfa-muted">{r.scorerName}</td>
              <td className="py-2">
                {r.status === "COMPLETED" ? "Completed" : `Open (${r.rated}/${r.total})`}
              </td>
              <td className="py-2">{r.finalScore === null ? "—" : `${r.finalScore} / 3`}</td>
              <td className="py-2 text-right">
                <Link href={`/review/${r.id}`} className="font-semibold text-mfa-red">
                  Open ›
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-mfa-muted">
                No reviews for {periodLabel} yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
```

Note: the unused `ratingLabel` import above is a mistake — do not include it. Import only what the file uses (`getAllReviews`, `getEligibleSubjectIds`, `getPeriodReviewOverview`, `BatchOpenButton`, the Next/React bits).

- [ ] **Step 5: Typecheck, lint, existing suite**

Run: `npx tsc --noEmit && npx next lint && npm test`
Expected: clean; all green. Fix any unused-import lint errors.

- [ ] **Step 6: Manual verification**

As admin at `/admin/reviews`:
1. Pick the active period. The overview shows the eligible count. If some reviews already exist (from earlier tasks), the button offers the remaining count.
2. Click "Open N review(s)" → confirm → the table fills with one row per eligible person, each `Open (0/m)`, scorer = their manager.
3. Click the button again → it's disabled / opens 0 (idempotent). Refresh — no duplicates.
4. Pick a period with no OMAs → eligible 0, button disabled.
5. Open a scorecard from the table, score + complete → back here, the row shows "Completed" and the score; "completed" counter goes up.

- [ ] **Step 7: Commit**

```bash
git add src/modules/review "src/app/(app)/admin/reviews"
git commit -m "feat(review): admin batch-open (R3)"
```

---

### Task 13: Full manual E2E + merge

**Files:** none (verification + docs)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test && npx tsc --noEmit && npx next lint && npm run build`
Expected: all green; production build succeeds.

- [ ] **Step 2: End-to-end script (browser, live DB, as the dev-bypass admin unless noted)**

1. `/admin/reviews` → active period → **Open reviews**. Confirm one review per person-with-OMAs, none for people without.
2. Open one person's scorecard. Rate OMA 1 "Meets", add a KPI note "watch churn", add a comment.
3. In another tab, edit that OMA — rename a KPI's measure and change the outcome. Back on the scorecard → **Refresh**. Confirm: outcome updated, rating still "Meets", comment kept, the KPI note on the *renamed* KPI is gone (measure no longer matches), a note on an unchanged KPI would have survived.
4. Rate the remaining OMAs. **Complete review**. Confirm review date set, final score = average shown as `X / 3`, everything read-only.
5. Set `AUTH_DEV_BYPASS` in `.env` to that subject's email, restart dev. Visit `/review` → the scorecard is under "Your scorecards" with the score. Open it → read-only, no controls.
6. Restore `AUTH_DEV_BYPASS` to the admin, restart. **Reopen** the review. As the subject again → `/review/<id>` redirects to `/review`, the card is gone from "Your scorecards".
7. Restore admin. Delete a throwaway review from a scorecard → redirms to `/review`, row gone from `/admin/reviews`.
8. Confirm the OMA module is untouched: open an OMA, edit it, save, copy it to another period — all still work.

- [ ] **Step 3: Update the spec status**

In `docs/superpowers/specs/2026-09-09-review-module-design.md`, change the status line to `Status: **built** · <today's date>`.

- [ ] **Step 4: Commit and merge**

```bash
git add docs/superpowers/specs/2026-09-09-review-module-design.md
git commit -m "docs(review): mark spec built"
git checkout main
git merge --no-ff feat/review-module -m "Merge: Review module (OMA Scorecard)"
git push origin main
```

- [ ] **Step 5: Confirm the deploy**

Vercel builds from `main`. Confirm the deployment succeeds and `/review` loads in production. The migration was already applied to the shared DB in Task 1, so no separate production migration step is needed.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §3.1 isolation wall, ESLint rule | Task 2 |
| §3.3 the seam `omaForReview.ts` | Task 3 |
| §4 data model `Review` / `ReviewItem` | Task 1 |
| §5.1 batch-open | Task 12 |
| §5.2 ad-hoc open | Task 8 |
| §5.3 scoring (rating/comment/notes) | Task 9 |
| §5.4 refresh + mergeRefresh | Tasks 5, 10 |
| §5.5 complete | Task 10 |
| §5.6 reopen | Task 10 |
| §5.7 delete | Task 10 |
| §6 R1 list | Task 11 |
| §6 R2 scorecard | Tasks 8, 9, 10 |
| §6 R3 admin | Task 12 |
| §6 entry points (header, person link) | Tasks 8, 11 |
| §7 permission table | Task 7 |
| §8 scoring.ts / snapshot.ts / openSelection.ts | Tasks 4, 5, 6 |
| §9 pure unit tests + manual E2E | Tasks 4–7, 13 |
| §5 edge: reassign scorer | Task 10 |

No gaps.

**2. Placeholder scan:** The `reassignScorer` action is built (Task 10) but has no UI in this plan — it's callable but not surfaced. That is intentional and matches the spec (§5 edge cases mention it as an admin capability; no screen is specified). Noted, not a placeholder. The `ratingLabel` mis-import in Task 12 Step 4 is called out explicitly with a correction instruction. No other placeholders.

**3. Type consistency:** `ReviewAuthShape` (Task 7) is reused verbatim in Tasks 8–10. `ExistingItem` / `NewItem` (Task 5) are consumed in Task 10. `ItemNote` (Task 5) is consumed in Tasks 9, 10. `OmaForReview` (Task 3) flows into Tasks 5, 8, 10, 12. `finalScore` / `canComplete` / `runningAverage` signatures (Task 4) match their call sites. `getReview` include shape (Task 8) matches the page's field access (Tasks 8–10). Consistent.
