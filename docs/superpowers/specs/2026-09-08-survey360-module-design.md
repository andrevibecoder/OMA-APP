# Munro FA — 360° Review Module + Module Framework · Design Spec

Status: **draft for review** · 8 Sept 2026
Follows on from `2026-08-27-munro-oma-app-design.md` (the OMA app, now live).

---

## 1. Scope of this build

Two things, built together, on one branch (`feat/survey360`):

1. **Module framework** — turn the single-purpose OMA app into a shell that can host
   several *performance modules* over one central admin. Built **only as far as the
   360° module needs it**; the remaining polish arrives when module 3 (Feedback) does.
2. **360° Review module** — request structured feedback about a person from their
   manager and peers, collect it in-app, and produce a confidential Self-vs-Others
   report for the person's manager and admins.

**Out of scope for this build** (later modules, tracked so the framework doesn't box them out):

- Feedback module (manager notes) — module 2.
- Reviews module (annual review pulling OMA + Feedback + 360°) — module 4.
- Company-wide 360° cycles, external/non-login raters, subject-visible reports,
  self-nominated raters, per-user module roles, per-round custom questionnaires.
- Moving OMA's routes under an `/oma/*` prefix — deferred until module 2.

### The four-module vision (context, not this build)

| # | Module | One line | This build |
|---|--------|----------|------------|
| 1 | OMA | Set your goals | live |
| 2 | Feedback | Regular manager notes on a person | not now |
| 3 | **360° Review** | Peer + manager feedback, emailed, answered in-app | **yes** |
| 4 | Reviews | Annual review combining 1–3, scored | not now |

Reviews (module 4) is the only planned cross-module consumer. Each module exposes a
`getForReview(userId, periodId)` function; Reviews calls those and never touches another
module's tables. This spec defines 360°'s version of that function so module 4 has it later.

---

## 2. Decisions — resolved in brainstorming

| # | Decision | Choice |
|---|----------|--------|
| D1 | How modular | One app, one database, one deploy. "Modules" = sealed code folders + a code registry. No microservices, no runtime module table. |
| D2 | Module RBAC | Global roles (Admin / Manager / User). Each module defines its own capability rules in code. No per-user module roles. |
| D3 | Shell scope now | Full framework: header module switcher, `/home` launcher listing all 4 modules, Core-vs-module admin split. |
| D4 | OMA routes | Leave at the site root for now. Prefix + redirects when module 2 lands. |
| D5 | Raters | Internal only (self, manager, peers, direct reports). Everyone answers in-app. |
| D6 | Confidentiality | **Anonymous except self.** The self-review is attributed; every other response — including the manager's — is pooled into "Others". |
| D7 | Cycle model | **Ad-hoc only.** No company-wide cycles. |
| D8 | Who runs a round | The subject's manager starts it and picks raters directly; an admin can do it for anyone. Subject just completes their self-review. |
| D9 | Questionnaire | **One company questionnaire**, admin-edited. Snapshotted into each round at open. |
| D10 | Results visibility | The subject's **manager and admins only**. Not the subject, not other managers. |
| D11 | Email | Resend. Invitations + reminders. Best-effort; in-app task list is the channel of record. |
| D12 | Reveal threshold | Results shown only when the round is `CLOSED` **and** submitted non-self responses ≥ `minResponsesToReveal` (default 3, admin-configurable). |

### Two accepted tensions

- **Open-book vs. confidential.** The OMA app is radically open; 360° is confidential.
  The framework therefore has **per-module visibility rules**, not one global rule.
- **Manager as rater.** If the manager both rates and views results, on a small panel
  they can partly infer the peer average from the "Others" aggregate (they know their
  own score). Mitigation is procedural — aim for ≥3 non-manager raters, or the manager
  facilitates without rating. Not solved in code for v1.

---

## 3. Architecture — the module framework

### 3.1 The isolation contract

```
src/core/            shared spine: user / business-unit / period data, session,
                     RBAC primitives. Knows nothing about any module.
                     Modules import FROM core; core never imports FROM a module.

src/modules/<key>/   one sealed folder per module: oma, survey360, feedback, review.
                     Each has its own authz.ts, queries.ts, server actions,
                     components, tests. A module may import from `core` and
                     from nothing else — never from another module.
                     Enforced by an ESLint import-boundary rule.

src/modules/registry.ts   the ONLY file that names all modules. Pure metadata:
                          { key, label, blurb, href, status, minRole }.
                          Drives the header switcher and the /home launcher.
```

**Migration of existing code is minimal and mechanical:**

- Move OMA's module-specific code into `src/modules/oma/` (queries, authz, actions,
  components, `omaValidation`, `progress`). Keep the *routes* where they are
  (`/`, `/bu`, `/person`, `/oma`) — they just import from the new location.
- `src/lib/{db,session,periods}.ts` and the `User`/`BusinessUnit`/`Period` concerns
  become `src/core/`.
- `src/lib/authz.ts` splits: the `SessionUser`/role primitives to `core/`, the
  OMA-specific `canEdit*` functions to `modules/oma/authz.ts`.

This is a refactor with no behaviour change — the existing OMA test suite is the
regression gate and must stay green, unchanged.

### 3.2 The registry

```ts
// src/modules/registry.ts
export type ModuleStatus = "live" | "soon"
export interface ModuleDef {
  key: "oma" | "survey360" | "feedback" | "review"
  label: string          // "OMA", "360° Review"
  blurb: string          // one line for the launcher card
  href: string           // "/", "/survey360"
  status: ModuleStatus
  minRole: Role           // gate for the whole module's routes
}

export const MODULES: ModuleDef[] = [
  { key: "oma",       label: "OMA",         blurb: "Set your goals.",            href: "/",          status: "live", minRole: "USER" },
  { key: "survey360", label: "360° Review", blurb: "Feedback from peers & managers.", href: "/survey360", status: "live", minRole: "USER" },
  { key: "feedback",  label: "Feedback",    blurb: "Regular notes from your manager.", href: "#",     status: "soon", minRole: "USER" },
  { key: "review",    label: "Reviews",     blurb: "Your annual review.",        href: "#",          status: "soon", minRole: "USER" },
]
```

### 3.3 Shell UI

- **Header** — the left side becomes a module menu (a `<details>`/popover listing
  `live` modules as links, `soon` modules greyed and inert). The current OMA wordmark
  moves onto the OMA area. The **Period selector renders only on OMA routes** — 360°
  is ad-hoc and periodless.
- **`/home`** — a launcher page: one card per module (label, blurb, "Open" for `live`,
  "Coming soon" for `soon`). Reachable from the module menu and the wordmark.
- **Admin split**:
  - `/admin` → **Core Admin**: users, business units, periods, login activity (unchanged
    content, re-housed).
  - `/admin/survey360` → the 360° questionnaire + config editor. Tabs across the admin
    area, one per `live` module that contributes settings, driven by the registry.
- **Route access** — a small helper in `core/` reads `registry.minRole` and the session
  role; each module's route group calls it. Reuses `getSessionUser()`.

### 3.4 Database

One Prisma schema. 360° tables are all prefixed `Survey360*`, sit in a delimited block,
and have **foreign keys only to `User` and `Period`** — never to OMA tables or (later)
other modules' tables. Migration is additive: `CREATE TABLE` / `CREATE TYPE` only, no
change to existing tables beyond optional nullable back-relation fields on `User`.

---

## 4. Data model — `Survey360*`

```prisma
enum Survey360QuestionType { RATING TEXT }
enum Survey360RoundStatus  { DRAFT OPEN CLOSED }
enum Survey360Relationship { SELF MANAGER PEER DIRECT_REPORT }
enum Survey360RaterStatus  { INVITED SUBMITTED DECLINED }
enum Survey360EmailKind    { INVITE REMINDER }

// ---- the single company questionnaire (admin-edited) -----------------------

model Survey360Question {
  id       String  @id @default(cuid())
  order    Int      @default(0)
  section  String?  // optional grouping heading, e.g. "Leadership"
  type     Survey360QuestionType
  prompt   String
  active   Boolean  @default(true)
}

model Survey360Config {           // singleton (id = "singleton")
  id                   String  @id @default("singleton")
  ratingMax            Int      @default(5)
  ratingLabels         Json     // ["Rarely", ... , "Consistently"] length = ratingMax
  minResponsesToReveal Int      @default(3)
  reminderDaysBefore   Int[]    @default([7, 2])
}

// ---- one round = one 360° for one person ---------------------------------

model Survey360Round {
  id           String   @id @default(cuid())
  subject      User     @relation("Survey360Subject", fields: [subjectId], references: [id])
  subjectId    String
  createdBy    User     @relation("Survey360Creator", fields: [createdById], references: [id])
  createdById  String
  status       Survey360RoundStatus @default(DRAFT)
  dueDate      DateTime
  period       Period?  @relation(fields: [periodId], references: [id])   // optional tag, helps Reviews
  periodId     String?
  note         String?  // shown to raters
  createdAt    DateTime @default(now())
  openedAt     DateTime?
  closedAt     DateTime?
  raters       Survey360Rater[]
  questions    Survey360RoundQuestion[]
  @@index([subjectId])
  @@index([status])
}

model Survey360RoundQuestion {    // snapshot of the questionnaire at open time
  id       String  @id @default(cuid())
  round    Survey360Round @relation(fields: [roundId], references: [id], onDelete: Cascade)
  roundId  String
  order    Int
  section  String?
  type     Survey360QuestionType
  prompt   String
  answers  Survey360Answer[]
  @@index([roundId])
}

model Survey360Rater {
  id             String  @id @default(cuid())
  round          Survey360Round @relation(fields: [roundId], references: [id], onDelete: Cascade)
  roundId        String
  user           User    @relation("Survey360Rater", fields: [userId], references: [id])
  userId         String
  relationship   Survey360Relationship
  status         Survey360RaterStatus @default(INVITED)
  declineReason  String?
  submittedAt    DateTime?
  lastRemindedAt DateTime?
  answers        Survey360Answer[]
  emails         Survey360EmailLog[]
  @@unique([roundId, userId])
  @@index([roundId])
}

model Survey360Answer {
  id             String  @id @default(cuid())
  rater          Survey360Rater @relation(fields: [raterId], references: [id], onDelete: Cascade)
  raterId        String
  roundQuestion  Survey360RoundQuestion @relation(fields: [roundQuestionId], references: [id], onDelete: Cascade)
  roundQuestionId String
  ratingValue    Int?
  cantAssess     Boolean @default(false)
  textValue      String?
  @@unique([raterId, roundQuestionId])
}

model Survey360EmailLog {
  id          String  @id @default(cuid())
  rater       Survey360Rater @relation(fields: [raterId], references: [id], onDelete: Cascade)
  raterId     String
  kind        Survey360EmailKind
  sentAt      DateTime @default(now())
  providerId  String?
  error       String?
  @@index([raterId])
}
```

`User` gains three nullable back-relations (`survey360Subject`, `survey360Created`,
`survey360RaterRoles`) — no data change.

### How anonymity is enforced

Rater identity **stays in the database** — it is needed for "who is outstanding",
reminders, and preventing double submission. It is simply **never surfaced in any
results view**. The results compiler (a pure function, thoroughly tested) returns:

- the self-review, attributed as "Self";
- everything else as one pooled **"Others"** aggregate (mean per rating question,
  response count) — with **no breakdown by relationship**;
- open-text answers listed verbatim under "Self" / "Others", the "Others" ones
  shuffled and unlabelled;

and returns the pooled data **only** when `status = CLOSED` and submitted non-self
responses `≥ Survey360Config.minResponsesToReveal`. No screen anywhere renders a
per-rater response for a non-self rater.

---

## 5. Screens

Route group `src/app/(app)/survey360/`. All require a session (`minRole: USER`).

### S1 — 360° home · `/survey360`
Landing for the module. Two lists:
- **Your feedback to give** — open rounds where you are an `INVITED` rater (incl. your
  own self-reviews). Each links to the survey form. This is the in-app task list.
- **Rounds you manage** — rounds you created, or where you manage the subject. Status,
  due date, response count. Admins see all rounds. Links to the round page.
"Start a 360°" button → S2 (managers see it for their team; admins for anyone).

### S2 — Start a round · `/survey360/new`
Pick the subject (own team for a manager; anyone for an admin). Set a due date,
optional period tag, optional note to raters. Creates a `DRAFT` round → S3.

### S3 — Round setup & monitor · `/survey360/[roundId]`
The round's control page for its manager/creator/admin.
- **DRAFT**: add raters from the user list, tag each `PEER` / `DIRECT_REPORT` /
  `MANAGER`; the `SELF` row is auto-added. Warn if non-self raters `< minResponsesToReveal`.
  "Open round" → snapshots the questionnaire, sends invites, status → `OPEN`.
- **OPEN**: rater table (name, relationship, status). Actions: send a reminder, add a
  rater, remove one who hasn't submitted, extend the due date, **Close round**.
- **CLOSED**: link to the results (S5). No further edits.
- DRAFT rounds are deletable by creator/admin; OPEN/CLOSED only by admin.

### S4 — The survey · `/survey360/[roundId]/respond`
For an `INVITED` rater on an `OPEN` round. The snapshotted questionnaire, by section.
Rating questions: the labelled scale + "Can't assess". Text questions: optional.
Self-review is the same questionnaire with first-person copy. **Save draft** any time
(upserts answers, status stays `INVITED`). **Submit** requires every rating question to
be answered or marked "Can't assess" (text stays optional); it writes atomically, locks
the form, sets `SUBMITTED`. **Decline** (optional reason) → `DECLINED`, doesn't count
toward the threshold, notifies the manager.

### S5 — Results · `/survey360/[roundId]/results`
Visible to the subject's manager and admins only (gated in `survey360/authz.ts`), and
only when `CLOSED`. If below threshold: "Not enough responses (need N, have M)" — the
self-review still shows. Otherwise: per rating question, **Self** vs **Others mean**
(+ count), with the Self-vs-Others gap highlighted; open text as "Self" / "Others"
(verbatim, shuffled, unlabelled).

### S6 — Questionnaire admin · `/admin/survey360`
Admin only. Reorderable list of questions (section, type, prompt, active toggle,
add/remove). Config: rating scale max + labels, `minResponsesToReveal`,
`reminderDaysBefore`. Editing the questionnaire never affects an open or closed round
(they hold snapshots).

---

## 6. Flows

**A · Manager runs a round.** S1 "Start a 360°" → S2 pick subject + due date → S3
add & tag raters → "Open round" (snapshot + invites) → monitor in S3 (reminders,
add/remove raters, extend) → "Close round" → results unlock (S5).

**B · Rater responds.** Email + S1 task ("Give feedback on X — due <date>") → S4
fill the questionnaire → Save draft / Submit (atomic, locks) or Decline. Never sees
another response or any result.

**C · Manager + admin read results.** S5, only when `CLOSED`. Below threshold →
message, no reveal. Otherwise Self-vs-Others report. `survey360.getForReview(userId,
periodId)` returns the same compiled structure for the future Reviews module (no
permission check of its own — the caller is responsible).

### Edge cases

Subject has no manager → admin-only for that round. Rater deactivated mid-round →
submitted answers stay, unsubmitted drops out (shown "unavailable"). Questionnaire has
zero active questions → can't open a round. Two open rounds for one subject → allowed,
warn. Manager leaves → admin can view/manage.

---

## 7. Permissions — `src/modules/survey360/authz.ts`

Roles are the app's existing three. "Manages X" = `X.managerId === user.id`.

| Capability | Admin | Manager | User |
|---|---|---|---|
| See the module / be a rater | ✅ | ✅ | ✅ |
| Start a round for person X | any X | X on their team | ❌ |
| Edit DRAFT / add-remove raters / open / monitor / remind / close | any | creator **or** manages subject | ❌ |
| Respond to a survey | only with an `INVITED` rater row on an `OPEN` round (role-independent) | | |
| View a round's results | any | **only if manages the subject** | ❌ |
| Delete a round | DRAFT: creator or admin · OPEN/CLOSED: admin only | | |
| Edit the questionnaire + config | ✅ | ❌ | ❌ |

Results screen is gated twice: authz decides **who** (admin, or subject's manager —
never the subject); the query decides **whether** (`CLOSED` + responses ≥ threshold).

---

## 8. Email — Resend

- `src/core/email.ts` — a thin `sendEmail({ to, subject, html })` wrapper around Resend.
  Core stays module-agnostic; templates + copy live in `src/modules/survey360/email/`.
- **Env**: `RESEND_API_KEY`, `EMAIL_FROM` (`Munro FA <noreply@munrofa.com>`), `APP_URL`,
  `CRON_SECRET`.
- **Sending domain**: `munrofa.com` DKIM/SPF verified in Resend (one-time, user task).
  Until then Resend only delivers to the account owner — fine for dev.
- **Sends**: invite on round open (per rater); reminder (Vercel Cron, daily, matches
  `reminderDaysBefore` against `dueDate`, un-submitted raters); manual reminder (button);
  decline → manager; close → manager.
- **Cron**: `vercel.json` daily job → `GET /api/survey360/reminders` authed with
  `CRON_SECRET`. Finds due rounds, emails outstanding raters, writes `Survey360EmailLog`,
  sets `lastRemindedAt`.
- **Reliability**: best-effort. A failed send is logged to `Survey360EmailLog.error` and
  never blocks a round opening (same pattern as the login-event write). `Survey360EmailLog`
  is checked before every send so a cron retry can't double-email. The in-app task list
  (S1) is the reliable channel.
- Resend free tier (~100/day, 3k/month) is ample.

---

## 9. Testing

**Pure-logic units (Vitest, no DB)** — the bulk of the value:

- `survey360/authz.ts` — every row of the permission table.
- **Results compiler** — below threshold → nothing revealed; at/above → revealed;
  manager's answer not separable from "Others"; self attributed; text shuffled + unlabelled;
  `cantAssess` excluded from means.
- **Reminder selector** — given open rounds + config + "today", which raters are due
  (and not double-sent).

**DB-backed integration** (seeded/branch DB, like `queries.integration.test.ts`):
open a round (snapshot + rater rows); submit answers (atomic, status flip); close +
results query (revealed only when closed + threshold met).

**Email** — Resend behind `core/email.ts`; fake sender, assert recipients + payload,
never hit Resend. `Survey360EmailLog` idempotency tested.

**Cron route** — thin handler; the "which reminders" logic is the unit test above.

**No component tests.** Manual browser pass of flows A/B/C against a branch DB before merge.

**Regression gate** — the full existing OMA suite stays green, untouched.

---

## 10. Project layout (after this build)

```
src/
  core/
    db.ts  session.ts  periods.ts  email.ts
    authz.ts                 # SessionUser, Role, route-access helper
    admin/                   # users / BUs / periods / login activity
  modules/
    registry.ts
    oma/                     # moved from src/lib + src/components (no behaviour change)
      authz.ts  queries.ts  validation.ts  progress.ts  actions/  components/
    survey360/
      authz.ts  queries.ts  results.ts  reminders.ts
      actions/  components/  email/
  app/(app)/
    home/page.tsx
    survey360/…               # S1–S5
    admin/                     # Core admin
    admin/survey360/page.tsx   # S6
    (oma routes stay: /, /bu, /person, /oma)
  app/api/survey360/reminders/route.ts
prisma/schema.prisma           # + Survey360* block
vercel.json                    # + daily cron
```

---

## 11. Build order (for the implementation plan)

1. **Framework refactor** — `core/` + `modules/oma/` move, `registry.ts`, ESLint
   boundary. OMA suite green, no behaviour change. *(No 360° yet.)*
2. **Shell UI** — header module switcher, `/home` launcher, admin split.
3. **360° data + questionnaire admin (S6)** — schema, migration, `Survey360Config` +
   default questionnaire in the seed, the admin editor.
4. **Round lifecycle (S1–S3)** — start, add raters, open (snapshot), monitor, close.
5. **Responses (S4)** — the survey form, draft/submit/decline.
6. **Results (S5) + `getForReview`** — the compiler, the screen, the threshold.
7. **Email** — `core/email.ts`, invite/reminder/decline/close, the cron route.
8. **Manual E2E** on a branch DB, then merge.

---

## 12. Prerequisites from the user

- **Resend**: API key (account exists); confirm `munrofa.com` is a verified sending
  domain, or the sender address to use until it is.
- A **branch / scratch database** for the manual E2E (or accept testing against a
  Supabase branch).
- The **rating scale** wording (default: 1 Rarely → 5 Consistently) and the **starting
  set of questionnaire questions** (can be edited later in S6, but the seed needs a
  first version).
- Confirm **`reminderDaysBefore`** (default 7 and 2 days before the due date).
