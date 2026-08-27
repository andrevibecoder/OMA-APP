# Munro FA — OMA Performance App · Design Spec

**Date:** 2026-08-27
**Status:** Approved for planning
**Source material:** `munro-oma-app-spec.md` (build spec), `UX/Screens/screen-1..5.png` (mockups)

---

## 1. Scope of this build

Build the **prototype spine**: the clickable read path (Screens 1–4) plus the
permission-aware edit path (Screen 5), on real auth and a real database, seeded
so the Screen 1 → 5 click-through works on first run.

**In scope**

- Milestone 1 — Scaffold (Next 14 / TS / Tailwind / brand tokens)
- Milestone 2 — DB + Prisma schema + migration + seed
- Milestone 3 — Auth.js credentials, login, session, route middleware
- Milestone 4 — Read path: Screens 1–4 with progress helper and RAG bars
- Milestone 5 — Edit path: Screen 5, permission-aware, 3-OMA cap

**Out of scope (this build)**

- Milestone 6 — Admin console (user CRUD, assign manager/BU, create Periods/BUs).
  Periods, BUs, users, and manager assignments are created by the seed script only.
- Everything in build-spec §13 (metric actual-vs-target, comment threads, review
  workflow, notifications, audit history, Word export, M365 sync, bonus model).

---

## 2. Open decisions — resolved

| # | Decision | Choice for v1 |
|---|---|---|
| 1 | User write scope | **Resolved in build spec:** Users own Actions (add/edit/reorder/tick) + own profile; read-only on Outcome + Metric. Managers own Outcome + Metric for their own team. Admin unrestricted. |
| 2 | Progress source | **% of Actions completed.** Metric actual-vs-target is v2. |
| 3 | Company roll-up | **Simple average of BU percentages.** Not headcount- or OMA-weighted. |
| 4 | Period model | **Quarterly only.** |
| 5 | Manager self-OMAs | **Yes.** A Manager is also a User in the tree; their OMAs are set by their own manager (an Admin in the seed). |

---

## 3. Architecture

### 3.1 Rendering & data flow

- **Reads (Screens 1–4):** async **Server Components**. Each page calls a data
  helper in `lib/` directly. No client JS, no REST API for the read path.
- **Writes (Screen 5, action ticking, OMA create):** **Server Actions**. The
  Server Action is the server-side trust boundary — every mutation validates the
  session and calls the authorization module before touching the DB.
- **Period selection:** a `?period=<periodId>` search param, defaulting to the
  active period. Every data helper takes an explicit `periodId`.

### 3.2 Auth

- **Auth.js (NextAuth v5)**, Credentials provider, bcrypt-hashed passwords.
- JWT / session carries: `id`, `name`, `role`, `businessUnitId`, `managerId`.
- `middleware.ts` protects every route except `/login` and Next internals.
- Login is rate-limited (simple in-memory throttle keyed by IP + email is
  sufficient for an internal app of this size).
- HTTPS-only in production; no third-party data egress (POPIA-conscious — this is
  staff performance data).

### 3.3 Authorization — single source of truth

`lib/authz.ts`:

```
canEditOutcomeMetric(session, oma): boolean
  ADMIN                                        -> true
  MANAGER where oma.owner.managerId === session.id -> true
  otherwise                                    -> false

canEditActions(session, oma): boolean
  ADMIN                                        -> true
  MANAGER where oma.owner.managerId === session.id -> true
  USER where oma.ownerId === session.id        -> true
  otherwise                                    -> false

canCreateOMA(session, targetUserId, targetUserManagerId): boolean
  ADMIN                                        -> true
  MANAGER where targetUserManagerId === session.id -> true
  otherwise                                    -> false
  (caller also enforces: target has < 3 OMAs in the period)

canEditProfile(session, userId): boolean
  session.id === userId  (any role)
```

- Both the **Server Actions** and the **UI** (Edit button visibility, disabled
  fields) call these functions. No permission logic is duplicated in components.
- Every Server Action that fails an authz check returns a 403-equivalent error and
  makes no DB write.

### 3.4 Progress computation

`lib/progress.ts` — nothing is stored; everything is derived on read.

```
ragState(pct): 'not-started' | 'behind' | 'in-progress' | 'on-track'
  pct === 0        -> not-started   (track grey #D9D9D9)
  1  <= pct <= 49  -> behind        (red   #C8102E)
  50 <= pct <= 79  -> in-progress   (amber #E8A33D)
  pct >= 80        -> on-track      (green #2E7D32)

omaProgress(oma): round(completed / total * 100), or 0 when total === 0

personProgress(userId, periodId): avg(omaProgress) over that person's OMAs
  in the period; null/0% when the person has no OMAs

buProgress(buId, periodId): avg(personProgress) over active users in the BU
  who have at least one OMA in the period

companyDashboard(periodId): [{ bu, pct }] over BUs that have any OMAs,
  ordered by BusinessUnit.order
```

Scale is dozens of users, so helpers fetch the relevant slice with Prisma
(`include` actions/metrics/owner as needed) and compute in TypeScript. No raw SQL
aggregation.

Data helpers:

- `getCompanyDashboard(periodId)` → Screen 1
- `getBusinessUnit(buId, periodId)` → Screen 2 (BU name + person rows)
- `getPerson(userId, periodId)` → Screen 3 (person name + OMA rows 1..3)
- `getOma(omaId)` → Screen 4 / 5 (full OMA with metrics, actions, owner, period)

---

## 4. Data model

Prisma schema exactly as build-spec §8:

- `Role` enum: `ADMIN | MANAGER | USER`
- `User` — name, email (unique), passwordHash, role, active, `businessUnitId?`,
  `managerId?` (self-relation `TeamMembers`), `omas` (relation `OwnedOMAs`)
- `BusinessUnit` — name (unique), `order` (dashboard sort), users
- `Period` — label (unique, e.g. "Q3 2026"), quarter, year, startDate, isActive
- `OMA` — `ownerId`, `periodId`, `sequence` (1..3), outcome, metrics[], actions[],
  timestamps, `@@unique([ownerId, periodId, sequence])`
- `Metric` — `omaId` (cascade delete), measure, target, order
- `Action` — `omaId` (cascade delete), description, `dueDate?`, completed,
  `completedAt?`, order

**Datasource:** PostgreSQL (Supabase).

```
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled, port 6543, ?pgbouncer=true
  directUrl = env("DIRECT_URL")     // direct, port 5432 — migrations & seed
}
```

`.env` (gitignored) holds `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`.
`.env.example` is committed with placeholder values and setup notes.

If the user opts to share an existing Supabase project rather than a dedicated
one, add `schemas = ["oma"]` and `@@schema("oma")` to isolate the tables. Default
assumption: dedicated project, public schema.

---

## 5. Screens

Header on every authenticated screen: Munro wordmark left; period selector +
signed-in user name + role badge right. Breadcrumbs above each page title —
uppercase, letter-spaced, active crumb in red, the rest muted grey. Page titles
in a light serif (Georgia).

### Screen 1 — Company dashboard · `/`

- Title "Main dashboard"; right eyebrow `Q3 · ALL DEPARTMENTS` (period label +
  "ALL DEPARTMENTS").
- One horizontal RAG bar per BusinessUnit, ordered by `BusinessUnit.order`, `%`
  right-aligned.
- Caption: "Bars show OMAs completed against OMAs set. Click a department to open
  its team."
- Row click → `/bu/[buId]`.

### Screen 2 — Business Unit · `/bu/[buId]`

- Breadcrumb `MAIN DASHBOARD / {BU} / {PERIOD}`. Title = BU name.
- One RAG bar per person in the BU (active users).
- Caption: "Department roll-up is the average of its people. Click a name to open
  their OMAs."
- Row click → `/person/[userId]`.

### Screen 3 — Person · `/person/[userId]`

- Breadcrumb `{BU} / {NAME} / {PERIOD}`. Title `{Name} — OMAs`.
- One RAG bar per OMA (labelled "OMA 1/2/3" by `sequence`). Show up to 3; if the
  person has fewer, show only what exists.
- Caption: "Three OMAs is the cap — it keeps the review conversation short and
  honest."
- Row click → `/oma/[omaId]`.
- If the viewer `canCreateOMA` for this person and they have < 3 OMAs, show a red
  pill "New OMA" that creates OMA `sequence = next` and navigates to its edit
  screen.

### Screen 4 — OMA detail (read) · `/oma/[omaId]`

- Breadcrumb `{BU} / {NAME} / OMA {n} / {PERIOD}`. Title `OMA {n} — detail`.
- **Outcome** in a grey panel `#F2F2F2`.
- **Metric** — two columns: `KPI: {measure}` | `Target: {target}`. One row per
  metric.
- **Actions** — numbered list, red numerals, grey rows. Checkbox shown when the
  viewer `canEditActions` on this OMA; ticking is an inline Server Action that
  re-renders the row and the progress upstream.
- **Edit** button (red pill, bottom-right) — shown only when the viewer
  `canEditActions` OR `canEditOutcomeMetric`. → `/oma/[omaId]/edit`.

### Screen 5 — OMA edit · `/oma/[omaId]/edit`

- Breadcrumb `... / EDIT`. Card styled like the Word template: red header bar
  `#C8102E` with `OMA {n} · Period {label} · Date {startDate}`.
- Sections: OUTCOME (textarea), METRIC / KPI (measure + target rows, add/remove),
  ACTIONS (action + due date rows, add/remove/reorder).
- **Permission-aware rendering** (`<OmaEditForm>`, client component):
  - `canEditOutcomeMetric` false → Outcome textarea and all Metric fields
    `disabled`; add/remove metric controls hidden.
  - `canEditActions` true → Actions section fully editable.
  - A viewer who is a plain User on their own OMA sees a read-only Outcome/Metric
    and an editable Actions section.
- **Save** (red pill, bottom-right) → Server Action → validates each section
  against authz independently (a User's payload can only change Actions) → back to
  `/oma/[omaId]`.
- The 3-OMA cap is enforced at creation (Screen 3), not here.

---

## 6. Brand tokens

CSS variables in `globals.css` and mirrored into the Tailwind theme:

```
--mfa-red    #C8102E   --rag-green  #2E7D32
--mfa-ink    #1A1A1A   --rag-amber  #E8A33D
--mfa-muted  #696969   --rag-red    #C8102E
--mfa-track  #D9D9D9
--mfa-panel  #F2F2F2
--mfa-white  #FFFFFF
```

- **Type:** titles → Georgia (serif, light weight). Body / labels / data / buttons
  / breadcrumbs → Inter (Google Fonts), semibold for names and percentages.
  Breadcrumbs uppercase + letter-spaced.
- **Components:** bars are fully-rounded pills (`width: {pct}%` on a track div);
  buttons are fully-rounded red pills, white text. Generous whitespace, no borders
  except the red card frame on Screen 5.

Shared components: `<AppHeader>`, `<Breadcrumbs items>`, `<PageTitle>`,
`<RagBar label value href?>`, `<RoleBadge role>`, `<PeriodSelector>`,
`<OmaEditForm>`.

---

## 7. Seed data

`prisma/seed.ts` — wipes and rebuilds, produces the full Screen 1 → 5
click-through from build-spec §10:

- **Period:** `Q3 2026`, `isActive = true`, startDate 2026-07-01, quarter 3,
  year 2026.
- **Business Units** (with `order` 0..6): Marketing, Sales, Product, Production,
  Finance, Systems, HR.
- **Company dashboard percentages** to hit (approx, emerging from seeded OMAs):
  Marketing 70, Sales 50, Product 60, Production 90, Finance 10, Systems 60,
  HR 30. Seed enough OMAs/actions per BU to land near these. Marketing must land
  at avg(33, 75, 40) ≈ 49–50 for its own people but the build spec's Screen 1
  shows Marketing 70 — **the Screen 1 numbers are illustrative; the canonical
  requirement is that Marketing's people read 33 / 75 / 40 and Sharine's OMAs
  read 100 / 45 / 0.** Other BUs are seeded with one or two synthetic users each
  to approximate their dashboard percentage. (Recorded as a known tension; Screen
  2 + Screen 3 exact numbers win.)
- **Marketing team:** manager `Manager` (role MANAGER); `Sharine`, `John`, `Sam`
  (role USER, `managerId` = the manager), all `businessUnitId` = Marketing.
  - Sharine: OMA1 100% (all actions completed), OMA2 45%, OMA3 0% (actions exist,
    none completed — bar shows grey track).
  - John: OMAs totalling ≈ 75%. Sam: ≈ 40%.
- **Sharine OMA1 (canonical, Screen 4):**
  - Outcome: "Marketing delivers a steady flow of qualified leads the sales team
    can work without rework."
  - Metric: KPI "Qualified leads" → Target "40 qualified leads by 31 Oct"
  - Actions: "Rework the lead form and scoring rules", "Run two paid tests per
    month", "Review the pipeline with Sales every Friday" — all completed.
- **Accounts for role testing:**
  - `admin@munrofa.com` — role ADMIN.
  - `sharine@munrofa.com` — role USER.
  - `manager@munrofa.com` — role MANAGER (Marketing).
  - All seeded with a known dev password (documented in `.env.example` / README),
    bcrypt-hashed.

---

## 8. Testing

**Vitest**, unit tests on the pure logic where the real risk lives:

`lib/progress.test.ts`
- `ragState` boundaries: 0, 1, 49, 50, 79, 80, 100 → correct state.
- `omaProgress`: 0 actions → 0; 1 of 3 → 33; 3 of 3 → 100; rounding.
- roll-ups: person avg over OMAs; BU avg skips people with no OMAs; company avg
  skips BUs with no OMAs.

`lib/authz.test.ts`
- ADMIN can edit Outcome/Metric and Actions on any OMA.
- MANAGER can edit Outcome/Metric on own-team OMA; **cannot** on another team's.
- USER can edit Actions on own OMA; **cannot** edit Outcome/Metric (returns
  false); cannot edit anything on someone else's OMA.
- `canCreateOMA`: MANAGER for own team only; caller-enforced 3-cap simulated.

Server Actions get a thin integration check (happy path + one rejected path)
against a test database if time allows; the authz unit tests are the priority.

No component/E2E tests in this build — the display components are thin wrappers
over the helpers.

---

## 9. Project layout

New folder inside `OMA APP/` (proposed name: `munro-oma/`).

```
munro-oma/
  prisma/
    schema.prisma
    seed.ts
    migrations/
  src/
    app/
      layout.tsx            # AppHeader + fonts + globals
      page.tsx              # Screen 1
      login/page.tsx
      bu/[buId]/page.tsx    # Screen 2
      person/[userId]/page.tsx        # Screen 3
      oma/[omaId]/page.tsx           # Screen 4
      oma/[omaId]/edit/page.tsx      # Screen 5
      actions/              # Server Actions: tickAction, saveOma, createOma
    components/             # AppHeader, Breadcrumbs, RagBar, PageTitle, ...
    lib/
      db.ts                # Prisma client singleton
      auth.ts              # Auth.js config
      authz.ts
      progress.ts
      periods.ts           # active period + ?period resolution
    middleware.ts
  .env.example
  README.md                # setup: Supabase strings, migrate, seed, dev
  tailwind.config.ts
  vitest.config.ts
```

---

## 10. Build order

1. Scaffold Next 14 + TS + Tailwind; brand tokens into globals + Tailwind theme;
   fonts; `<AppHeader>` / `<Breadcrumbs>` / `<PageTitle>` / `<RagBar>` shells.
2. Prisma schema; `prisma migrate dev`; `lib/db.ts`. **(needs `DATABASE_URL` +
   `DIRECT_URL`.)**
3. `lib/progress.ts` + `lib/authz.ts` with Vitest tests — green before UI.
4. `prisma/seed.ts`; run it; verify the seeded numbers.
5. Auth.js credentials + `/login` + `middleware.ts` + session shape.
6. Read path: Screens 1–4 wired to the helpers, RAG bars, breadcrumbs,
   period selector, permission-aware Edit button.
7. Edit path: `<OmaEditForm>` + `saveOma` / `createOma` / `tickAction` actions;
   3-OMA cap; permission-aware fields.
8. Pass over spacing/type against the five mockups; empty states.

Ship steps 1–6 as a clickable prototype before wiring the edit path.

---

## 11. Setup prerequisites (from the user)

- **Supabase connection strings:** `Settings → Database → Connection string → URI`
  - `DATABASE_URL` = pooled (port 6543, host contains `pooler`, append
    `?pgbouncer=true`)
  - `DIRECT_URL` = direct (port 5432)
- **Dedicated Supabase project** preferred (seed wipes tables). If reusing an
  existing project, say so → Prisma is pinned to an `oma` schema.
- **Git remote** for the repo (URL) when we reach the first commit.
