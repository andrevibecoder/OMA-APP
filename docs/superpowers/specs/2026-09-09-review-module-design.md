# Munro FA — Review Module (OMA Scorecard) · Design Spec

Status: **draft for review** · 9 Sept 2026
Follows on from `2026-08-27-munro-oma-app-design.md` (the OMA app, live).
Supersedes the Reviews portion of `2026-09-08-survey360-module-design.md` — see §1.

---

## 1. Scope of this build

Build the **Review module** (the "OMA Scorecard"): a manager scores each of a
person's OMAs for a period, 1–3, with comments, and the scorecard rolls those into
a final score the person can see once it's complete.

**Pivot context.** The original four-module vision (OMA, Feedback, 360°, Reviews)
is on hold. Munro's teams need to review OMAs *now*. The plan is a **two-module
system — OMA + Review** — with Feedback and 360° deferred indefinitely. The module
framework refactor from the 360° spec (moving OMA into `src/modules/oma/`, a
registry, a header switcher, a `/home` launcher) is **not** done here. Review is
built as a sealed module beside the untouched OMA code.

**The hard constraint: do not disrupt the live OMA module.** No existing OMA file
is modified. The OMA test suite is the regression gate and stays green, unchanged.
The only shared files touched are `prisma/schema.prisma` (new tables) and
`src/components/AppHeader.tsx` (one nav link).

**In scope**

- `Review` + `ReviewItem` tables; additive migration.
- `src/lib/omaForReview.ts` — the single read-only accessor into OMA data.
- `src/modules/review/` — sealed module: authz, scoring, snapshot, queries,
  server actions, components. ESLint import-boundary rule.
- Screens: review list (R1), the scorecard (R2), admin batch-open (R3).
- Two kickoff paths: admin batch-open for a period; manager/admin ad-hoc for one
  person.
- Lifecycle: `OPEN` → `COMPLETED`, with admin/scorer reopen.

**Out of scope (later, or never)**

- PDF / print export of a completed scorecard — wanted eventually (the manual
  sample is a PDF), not this build.
- Subject self-rating; a separate "Acknowledged" state; per-round custom rating
  scales; company-wide review cycles beyond the batch-open; notifications/email.
- The Feedback and 360° modules, and the module framework shell.
- Moving OMA routes under an `/oma/*` prefix.

---

## 2. Decisions — resolved in brainstorming

| # | Decision | Choice |
|---|----------|--------|
| D1 | What a review is | A **scored review**. One overall rating per OMA (1 Below / 2 Meets / 3 Exceeds) + a comment, plus optional free-text notes on individual KPIs / actions. |
| D2 | Final score | **Plain average of the per-OMA ratings**, one decimal (e.g. 2.3), shown as "2.3 / 3". Frozen at completion. |
| D3 | Who scores | **The subject's manager only.** An admin can score any review (and is the scorer when the subject has no manager). |
| D4 | Kickoff | **Both.** Admin batch-opens all reviews for a period; a manager or admin can also open one ad-hoc for a single person. |
| D5 | Batch scope | Every **active** person with **≥1 OMA** in that period who doesn't already have a review. People with no OMAs are skipped. Re-running fills gaps only — never duplicates or overwrites. |
| D6 | OMA data | **Snapshotted** into `ReviewItem` as JSON when the review opens. The scorecard has no foreign key into OMA tables and survives later OMA edits/deletion. A **Refresh** button re-pulls while the review is `OPEN`. |
| D7 | Lifecycle | `OPEN` → `COMPLETED`. Admin, or the review's scorer, can reopen a completed review. No Draft, no Acknowledge. |
| D8 | Visibility | Manager (scorer or manages the subject) + admin at any time. **The subject sees their own scorecard only once it is `COMPLETED`** — never while `OPEN`. |
| D9 | Period lock | Reviews are **independent of the OMA period lock**. A locked period still accepts new and completed reviews. |
| D10 | Comments | A comment per OMA rating (+ optional KPI/action notes). **No** overall summary comment. |
| D11 | Isolation | Sealed `src/modules/review/`. One read-only seam (`src/lib/omaForReview.ts`). ESLint boundary rule both ways. Zero edits to existing OMA files. |
| D12 | Rating labels | "Below Expectation" / "Meets Expectation" / "Exceeds Expectation" (from the manual sample). |

---

## 3. Architecture

### 3.1 The isolation wall

```
src/
  modules/
    review/
      authz.ts        who can open / score / view / reopen / delete a review
      scoring.ts      pure: ratings -> average; canComplete; label helpers
      snapshot.ts     pure: buildItems(omas); mergeRefresh(existing, fresh)
      openSelection.ts pure: subjectsToOpen(eligibleIds, existingIds)
      queries.ts      read helpers for R1 / R2 / R3
      actions/        server actions: openAdHoc, batchOpen, scoreItem,
                      addNote, refresh, complete, reopen, deleteReview
      components/     Scorecard, RatingControl, ItemNote, ReviewList, AdminReviews
  lib/
    omaForReview.ts   the ONLY seam — one read-only function (new file)
  app/(app)/
    review/
      page.tsx                  R1 — review list
      [reviewId]/page.tsx       R2 — the scorecard
    admin/reviews/page.tsx      R3 — admin batch-open + period overview
```

**ESLint `no-restricted-imports` (added to `.eslintrc.json`):**

- Files under `src/modules/review/**` may import shared infrastructure only:
  `@/lib/db`, `@/lib/session`, `@/lib/periods`, `@/lib/authz` (session/role
  primitives), `@/lib/dbRetry`, `@/lib/progress` (pure KPI value formatting), and
  `@/lib/omaForReview`. They **may not** import `@/lib/queries`,
  `@/lib/omaValidation`, `@/lib/omaCopy`, any `@/components/*` except
  `@/modules/review/components/*`, or any `@/app/(app)/oma|bu|person` route.
- Existing OMA files (`@/lib/queries`, `@/lib/omaValidation`, `@/lib/omaCopy`,
  `@/lib/progress`, `@/components/Oma*`, `@/app/(app)/oma/**`, `.../person/**`,
  `.../bu/**`) **may not** import anything from `@/modules/review/**`.

If OMA later becomes its own module, `omaForReview.ts` moves into it and nothing
else changes.

### 3.2 Rendering & data flow

Follows the OMA app's conventions exactly:

- **Reads** (R1–R3): async Server Components calling `src/modules/review/queries.ts`
  directly. No REST API.
- **Writes**: Server Actions in `src/modules/review/actions/`. Each action is the
  trust boundary — it validates the session and calls `review/authz.ts` before any
  DB write. Zod schemas for action inputs, mirrored from the OMA app's pattern.
- **Period context**: reviews are tied to a `periodId`. R3 takes an explicit
  period; R1/R2 read it from the review row. The global `?period=` selector in the
  header is an OMA concern and is not consulted by review routes.

### 3.3 The seam — `src/lib/omaForReview.ts`

```ts
import type { MetricDirection, MetricUnit } from "@prisma/client"

export type OmaForReview = {
  omaId: string
  sequence: number
  title: string
  outcome: string
  kpis: {
    measure: string
    unit: MetricUnit
    direction: MetricDirection
    target: number
    current: number
  }[]
  actions: { description: string; dueDate: Date | null; completed: boolean }[]
}

// Read-only. One Prisma query against OMA + Metric + Action for one person in
// one period, ordered by sequence then order. No writes, ever. Additive file —
// no existing OMA code is changed.
export async function getOmasForReview(
  userId: string,
  periodId: string,
): Promise<OmaForReview[]>
```

### 3.4 Database

One Prisma schema. Review tables are all prefixed `Review`, sit in a delimited
block, and have **foreign keys only to `User` and `Period`** — never to `OMA`,
`Metric`, `Action`, or any future module's tables. Migration is additive:
`CREATE TABLE` / `CREATE TYPE` only, plus two nullable back-relation fields on
`User`. No change to any existing column.

---

## 4. Data model — `Review*`

```prisma
enum ReviewStatus { OPEN COMPLETED }
enum OmaRating    { BELOW MEETS EXCEEDS }   // 1 / 2 / 3

model Review {
  id           String       @id @default(cuid())
  subject      User          @relation("ReviewSubject", fields: [subjectId], references: [id])
  subjectId    String
  scorer       User          @relation("ReviewScorer",  fields: [scorerId],  references: [id])
  scorerId     String        // the subject's manager, or an admin
  period       Period        @relation(fields: [periodId], references: [id])
  periodId     String
  status       ReviewStatus  @default(OPEN)
  finalScore   Float?        // mean of item ratings (1..3, 1 dp); frozen on complete
  reviewDate   DateTime?     // stamped on complete
  createdById  String?       // who opened it — admin batch or manager ad-hoc
  createdAt    DateTime      @default(now())
  completedAt  DateTime?
  items        ReviewItem[]

  @@unique([subjectId, periodId])   // one scorecard per person per period
  @@index([scorerId])
  @@index([status])
}

model ReviewItem {                  // one per OMA, snapshotted at open / refresh
  id        String     @id @default(cuid())
  review    Review     @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  reviewId  String
  omaId     String     // reference only — NOT a relation. Survives OMA deletion.
  order     Int
  sequence  Int
  title     String
  outcome   String
  kpis      Json       // [{ ref, measure, unit, direction, target, current }]
  actions   Json       // [{ ref, description, dueDate, completed }]
  rating    OmaRating?
  comment   String?
  notes     Json?      // optional KPI/action notes: [{ ref, kind: "kpi"|"action", text }]

  @@index([reviewId])
}
```

`User` gains two nullable back-relations: `reviewsAsSubject Review[] @relation("ReviewSubject")`
and `reviewsAsScorer Review[] @relation("ReviewScorer")`. `Period` gains
`reviews Review[]`. No data change.

**The snapshot.** `ReviewItem.kpis` and `.actions` are frozen JSON captured from
`getOmasForReview`. Each entry carries a generated `ref` (cuid) so a `notes` entry
can point at one specific KPI or action. `omaId` is a plain string — the scorecard
is entirely self-contained and does not break if the OMA is later edited or
deleted. A "view the current OMA" link is offered only when that `omaId` still
resolves.

---

## 5. Behaviour & flows

### 5.1 Batch-open — admin, R3

Input: a `periodId`.

1. `getEligibleSubjects(periodId)` — active users with ≥1 OMA in that period
   (a `db.user` query filtered by `omas: { some: { periodId } }`), minus those who
   already have a `Review` for that `periodId`.
2. For each: create `Review { subjectId, scorerId: managerId ?? actingAdminId,
   periodId, status: OPEN, createdById: actingAdminId }` and, from
   `getOmasForReview(subjectId, periodId)` + `snapshot.buildItems`, its
   `ReviewItem` rows — in one transaction per subject.
3. Idempotent: subjects with an existing review are skipped entirely. Re-running
   after new people get OMAs only creates the missing reviews.

Result summary shown on R3: *N eligible · M reviews now exist · K completed*.

### 5.2 Ad-hoc open — manager or admin

From R1 ("Start a review") or the person page. Same creation as one iteration of
5.1, for one subject + period. Rejected with a clear message if a review already
exists for that subject+period. A manager may only do this for a subject they
manage; an admin for anyone.

### 5.3 Scoring — the scorer, while `OPEN` (R2)

- Per item: set `rating` (BELOW / MEETS / EXCEEDS), edit `comment`, add/edit/remove
  `notes` on individual KPI or action rows. Each is its own small server action
  (`scoreItem`, `addNote`) writing just that row — matches the OMA app's
  granular-save feel; no giant form submit.
- The snapshot (outcome, KPIs, actions) is **read-only** on screen.

### 5.4 Refresh — the scorer, while `OPEN`

`refresh(reviewId)`: re-pull `getOmasForReview`, then `snapshot.mergeRefresh`:

- Match fresh OMAs to existing items by `omaId`.
- Existing item: overwrite `title / outcome / kpis / actions / sequence / order`
  from the fresh snapshot (each KPI/action gets a **new** `ref`); **keep `rating`,
  `comment`**. Re-attach `notes`: a KPI note carries over when the fresh snapshot
  still has a KPI with the same `measure` (re-pointed to its new `ref`); an action
  note carries over when a fresh action has the same `description`. Notes with no
  text match are dropped. *(The OMA module recreates its `Metric` rows on every
  save, so KPI ids are not stable — text is the only reliable key.)*
- Fresh OMA with no existing item: add a new unrated item.
- Existing item whose `omaId` is gone from the fresh set: delete it (its rating
  goes with it).

One transaction. Only allowed while `OPEN`.

### 5.5 Complete — the scorer

`complete(reviewId)`: allowed only when `scoring.canComplete(items)` — every item
has a `rating`. Sets `status: COMPLETED`, `completedAt: now`, `reviewDate: now`,
`finalScore: scoring.finalScore(items)`. The scorecard becomes visible to the
subject and read-only for everyone.

### 5.6 Reopen — admin or the review's scorer

`reopen(reviewId)`: `COMPLETED` → `OPEN`, clears `finalScore` / `reviewDate` /
`completedAt`. Items and their ratings are retained. The subject loses visibility
again until it's re-completed.

### 5.7 Delete — admin only

`deleteReview(reviewId)` — any status. Cascades to `ReviewItem`.

### Edge cases

- **Subject has no manager** → the acting admin becomes `scorerId`; managers can't
  ad-hoc-open for them (not their team).
- **Subject has no OMAs in the period** → not eligible for batch; ad-hoc open is
  rejected ("no OMAs to review this period").
- **All of a subject's OMAs deleted after open** → refresh empties the item list;
  `canComplete` is false on an empty list, so it can't be completed until at least
  one OMA exists again (or an admin deletes the review).
- **OMA edited between open and complete** → the frozen snapshot stands unless the
  scorer hits Refresh.
- **Manager changes mid-review** → the `scorerId` on the row does not auto-change;
  an admin can reassign by editing the review (admin-only `reassignScorer` action)
  or score it themselves.
- **Two people try to open the same review** → the `@@unique([subjectId, periodId])`
  constraint makes the second a caught `P2002` with a friendly message.

---

## 6. Screens

Route group `src/app/(app)/review/`. All require a session.

### R1 — Review list · `/review`

- **Reviews to score** — `OPEN` reviews where `scorerId === you` (managers/admins).
  Columns: subject, period, `rated / total`, "Score" → R2.
- **Your scorecards** — `COMPLETED` reviews where `subjectId === you`. Columns:
  period, final score, review date, "View" → R2.
- **Admin**: an all-reviews table with a period filter and a status filter, plus a
  link to R3.

### R2 — Scorecard · `/review/[reviewId]`

Header block (mirrors the manual sample): subject name, role/title, review period,
date created, review date (blank until `COMPLETED`), status pill, running average.

One section per `ReviewItem`, in `order`:

- **Snapshot (read-only)**: `OMA <sequence> · <title>`, outcome, a KPI table
  (measure / target / current / attainment %, using `@/lib/progress` formatters),
  actions with due dates and done state.
- **Rating**: a 3-way control — 1 Below / 2 Meets / 3 Exceeds. Editable by the
  scorer while `OPEN`; otherwise shown as a static label.
- **Comment**: a textarea, same edit rule.
- **Notes**: an "add note" affordance on each KPI and action row; existing notes
  listed beneath the row. Same edit rule.

Footer:

- **average** — while `OPEN`, the mean of the *rated* items so far (an in-progress
  indicator, labelled "so far"); once `COMPLETED`, the frozen `finalScore`,
- **Refresh from current OMAs** — scorer, `OPEN` only,
- **Complete review** — scorer, enabled only when every item is rated,
- **Reopen** — scorer/admin, `COMPLETED` only,
- **Delete** — admin only.

### R3 — Admin reviews · `/admin/reviews`

Admin only (route guarded by role). Reached from the **admin block on R1** and
directly navigable — the existing `/admin` console (`AdminConsole.tsx`) is **not**
modified.

- Period picker.
- Overview for the chosen period: eligible people, reviews existing, completed.
- **Open reviews for this period** — the batch action (5.1), with a confirm.
- The period's review table: subject, scorer, status, score, link to R2.

### Entry points

- `AppHeader.tsx`: a **"Reviews"** link (the one shared-file change besides schema).
- Person page: a small **"Review · <period>"** link when a review exists for the
  viewed person+period; **"Start review"** for a manager/admin when it doesn't.
  *(This is rendered by a new `<PersonReviewLink>` review-module component dropped
  into the existing page — the page file itself is not modified beyond adding the
  one import + element. If even that is unwanted, the entry point is R1 + the
  header link only; decide at spec review.)*

---

## 7. Permissions · `src/modules/review/authz.ts`

"Manages X" = `X.managerId === user.id`. Roles are the app's existing three.

| Capability | Admin | Manager | User |
|---|---|---|---|
| Batch-open reviews for a period | ✅ | ❌ | ❌ |
| Ad-hoc open a review for person X | any X | X on their team | ❌ |
| Score / comment / note / refresh | ✅ any | only where `scorerId === self` | ❌ |
| Complete a review | ✅ any | only where `scorerId === self` | ❌ |
| Reopen a completed review | ✅ any | only where `scorerId === self` | ❌ |
| Reassign the scorer | ✅ | ❌ | ❌ |
| View a scorecard | ✅ any | scorer, **or** manages the subject | **own only, and only `COMPLETED`** |
| Delete a review | ✅ any | ❌ | ❌ |

The scorecard screen is gated twice: authz decides **who**; the query/row decides
**whether** (a `USER` sees nothing until `status === COMPLETED`). A locked OMA
period changes none of this.

---

## 8. Scoring · `src/modules/review/scoring.ts` (pure, no DB)

```ts
export const RATING_VALUE: Record<OmaRating, number> = { BELOW: 1, MEETS: 2, EXCEEDS: 3 }

// null if any item is unrated; otherwise the mean of RATING_VALUE, rounded to 1 dp.
// This is the official score, frozen onto Review.finalScore at completion.
export function finalScore(items: { rating: OmaRating | null }[]): number | null

// The in-progress "so far" average shown on an OPEN scorecard: mean of the rated
// items only, 1 dp; null when nothing is rated yet.
export function runningAverage(items: { rating: OmaRating | null }[]): number | null

// true only when items is non-empty and every item has a rating.
export function canComplete(items: { rating: OmaRating | null }[]): boolean

export function ratingLabel(r: OmaRating): string   // "Below Expectation" | ...
export function ratingNumber(r: OmaRating): 1 | 2 | 3
```

`snapshot.ts` (also pure where possible):

```ts
type NewItem = Omit<ReviewItemData, "id" | "reviewId" | "rating" | "comment" | "notes">

export function buildItems(omas: OmaForReview[]): NewItem[]
// assigns order = index; generates a `ref` cuid per kpi/action entry.

export function mergeRefresh(
  existing: ReviewItemRow[],
  fresh: OmaForReview[],
  makeRef: () => string,
): { create: NewItem[]; update: ItemUpdate[]; deleteIds: string[] }
// match items on omaId; preserve rating/comment; re-attach KPI notes by matching
// `measure`, action notes by matching `description`; drop notes with no match.
```

`ref` generation (via `nanoid`, already a dependency) is injected as a
`makeRef: () => string` param to both functions so tests are deterministic.

`openSelection.ts`:

```ts
// Which subjects still need a review created for this period. Pure — the DB
// query for eligibility and existing reviews lives in the batchOpen action.
export function subjectsToOpen(
  eligibleSubjectIds: string[],
  existingReviewSubjectIds: string[],
): string[]
```

---

## 9. Testing

**Pure units (Vitest, no DB) — the bulk of the value:**

- `scoring.ts` — mean maths; 1-dp rounding (2 + 3 + 2 → 2.3); `finalScore` `null`
  when any item unrated; `runningAverage` ignores unrated items and is `null` when
  none rated; `canComplete` false on empty and on partial; labels/numbers.
- `snapshot.ts` — `buildItems` shape and `ref` assignment; `mergeRefresh`:
  unchanged OMA keeps its rating/comment; a KPI note re-attaches when `measure`
  still matches and is dropped otherwise; an action note re-attaches by
  `description`; a new OMA becomes an unrated item; a vanished OMA is dropped.
- `authz.ts` — every row of the §7 table, both branches of "manages the subject".
- `openSelection.ts` — `subjectsToOpen(eligibleIds, existingReviewSubjectIds)`
  returns exactly the ids needing a new review (batch-open idempotency, pure).

**No automated DB-backed tests.** There is only one database — the live Supabase
instance — and the existing integration suite reseeds (wipes) it, so it cannot be
run here. The DB-backed behaviour is instead covered by pushing the logic into the
pure functions above (`subjectsToOpen`, `finalScore`, `canComplete`, `mergeRefresh`,
`authz`) so the server actions are thin glue, plus the manual E2E below.

**Manual E2E** (browser, against the live DB, before merge): batch-open for a
period → confirm one review per eligible person, none for people without OMAs →
score an OMA, add a KPI note → edit that OMA, hit Refresh → confirm rating kept,
note re-attached → complete → sign in as the subject and confirm the scorecard is
now visible and read-only → reopen as admin → confirm subject loses visibility.

**Boundary:** the new ESLint rule passes; a deliberate `import` from
`@/modules/review` into an OMA file (and vice versa) fails lint.

**Regression gate:** the entire existing suite — `omaValidation`, `omaCopy`,
`authz`, `progress`, `dbRetry`, `queries.integration` — runs unchanged and stays
green.

**No component tests.** Manual browser pass of batch-open → score → refresh →
complete → subject view, on the live DB, before merge.

---

## 10. Project layout (after this build)

```
src/
  lib/
    omaForReview.ts                     # new — the only seam
  modules/
    review/
      authz.ts  scoring.ts  snapshot.ts  openSelection.ts  queries.ts
      actions/  { open.ts, batch.ts, score.ts, lifecycle.ts }
      components/ { Scorecard.tsx, RatingControl.tsx, ItemNotes.tsx,
                    ReviewList.tsx, AdminReviews.tsx, PersonReviewLink.tsx }
  app/(app)/
    review/page.tsx                     # R1
    review/[reviewId]/page.tsx          # R2
    admin/reviews/page.tsx              # R3
  components/AppHeader.tsx              # + one "Reviews" link
prisma/schema.prisma                   # + Review* block, 2 User back-relations
.eslintrc.json                         # + import-boundary rule
```

Existing OMA files: **unchanged**.

---

## 11. Build order (for the implementation plan)

1. **Schema + migration + seam + boundary.** `Review` / `ReviewItem` / enums,
   additive migration, `src/lib/omaForReview.ts`, the ESLint rule. Full existing
   suite green; migration applied to the live DB (additive, backward-compatible).
2. **Pure logic (TDD).** `scoring.ts`, `snapshot.ts`.
3. **authz + queries.** `review/authz.ts` (table-tested), `review/queries.ts`.
4. **Scorecard read path (R2).** The snapshot rendering, status/header, running
   average — read-only, for an already-opened review.
5. **Scoring writes.** `scoreItem`, `addNote`, plus `refresh`, `complete`,
   `reopen`, `deleteReview`; wire the R2 controls.
6. **Ad-hoc open + R1 + entry points.** `openAdHoc`, the review list, the header
   link, `PersonReviewLink`.
7. **Admin batch-open (R3).** `batchOpen` (over the pure `subjectsToOpen`), the
   eligibility query, the overview + table.
8. **Manual E2E** on the live DB (the §9 script), then merge.

---

## 12. Prerequisites / confirmations from the user

- **Resolved:** final score = plain average of the 1–3 ratings, one decimal, shown
  "2.3 / 3". Rating labels = "Below / Meets / Exceeds Expectation". PDF export =
  later, not this build.
- **Confirm at spec review:** the person-page entry point (`PersonReviewLink`) —
  in, or keep the entry points to the header link + R1 only?
- **Confirm at spec review:** a manual E2E against the live DB is acceptable (no
  separate branch DB; automated DB-backed tests can't run against the shared
  instance), with the module's logic pushed into pure, unit-tested functions.
