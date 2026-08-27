# Munro FA — OMA Performance App · Build Spec

> Drop this file at the root of a fresh repo and point Claude Code at it. It is written to be executable top-to-bottom. Rename to `CLAUDE.md` if you want it picked up automatically.

---

## 1. Purpose

An internal performance-management app for Munro FA. **The OMA framework (Outcome → Metric → Actions) is the skeleton of the entire app** — every screen, the data model, and the scoring all hang off it. It is not a goals module bolted onto an HR tool; the OMA *is* the object.

The app makes progress visible top-down: **Company → Business Unit → Person → OMA → OMA detail/edit**, exactly the click-through in the mockups (Screen 1 → 5).

Open-book by design: **everyone can see everyone's OMAs and progress.** Roles differ only in *write* permission and *admin* rights.

---

## 2. Roles & permissions (RBAC)

Three roles. Read is universal; the difference is what each can write.

Read is universal. The ownership split is the important part: **Manager owns the *what* (Outcome + Metric); the person doing the work owns the *how* (Actions).**

| Capability | Admin | Manager | User |
|---|---|---|---|
| View company dashboard, any BU, any person, any OMA | ✅ | ✅ | ✅ |
| Create / delete an OMA (the block itself) | ✅ any | ✅ **own team only** | ❌ |
| Edit **Outcome + Metric/Target** | ✅ any | ✅ **own team only** | ❌ (read-only) |
| Add / edit / reorder / tick **Actions** | ✅ any | ✅ **own team** | ✅ **own OMAs only** |
| Edit own profile (name, password) | ✅ | ✅ | ✅ |
| Add / delete users | ✅ | ❌ | ❌ |
| Assign users → managers, users → Business Units | ✅ | ❌ | ❌ |
| Create Business Units & Periods | ✅ | ❌ | ❌ |

**"Own team" for a Manager** = every User whose `managerId` = that manager. A Manager may view OMAs across the whole company but may only write to their own team's.

**Flow in practice:** Manager (or a review conversation) creates the OMA and sets Outcome + Metric → the User populates and owns the Actions to hit that Metric, ticking them off as they go → progress bar moves. The Manager reviews against the **Metric**, not the tick-count.

### ✅ Decision #1 — RESOLVED
Users own their own Actions (add/edit/reorder/tick) + edit their profile. Users are **read-only on Outcome + Metric** — they cannot rewrite the manager-agreed goal or its measure. This keeps the bar live without letting the goalposts move.

---

## 3. Domain model — the OMA (from `OMA_Template.docx`)

One OMA is a single block with three parts:

- **Outcome** — one qualitative statement. The end state, described as a *state not an activity*, no numbers. (Numbers live in the Metric.)
- **Metric / KPI** — one or more rows of `measure → target`. What you measure, and the level to hit.
- **Actions** — one or more rows of `action → due date`. Verb-led moves that drive the Metric.

Each OMA is scoped to a **Person** and a **Period**, and carries `Period` + `Date` (see Screen 5 header: "OMA 1 · Period Q3 2026 · Date 01 Jul 2026").

**Cap: max 3 OMAs per person per period** (Screen 3: "Three OMAs is the cap"). Enforce in the UI and the API.

---

## 4. Progress & RAG logic (derived from the mockups)

Progress is computed, never free-typed.

```
oma.progress      = round(completedActions / totalActions * 100)   // 0 if no actions
person.progress   = avg(oma.progress) over that person's OMAs in the period
bu.progress       = avg(person.progress) over active users in the BU who have OMAs
company.progress  = avg(bu.progress) over BUs with OMAs
```

**RAG bar colour** (matches every bar in the mockups):

| Progress | State | Bar colour |
|---|---|---|
| `0` | Not started | Track grey `#D9D9D9` |
| `1–49` | Behind | Red `#C8102E` |
| `50–79` | In progress | Amber `#E8A33D` |
| `≥ 80` | On track / done | Green `#2E7D32` |

Sanity-check against the mockups: Production 90 → green, Sales 50 → amber, HR 30 → red, Sharine OMA3 0 → grey track only. ✔️

> **Decision #2 (noted):** "% complete" = *Actions ticked*, not *Metric target hit*. It's objective and buildable now. Tracking actual-vs-target on the Metric is a v2 upgrade (§13).

---

## 5. Screens (map 1:1 to the PDF, in click order)

Header on every authenticated screen: Munro logo left, **Period selector** (default active period) + signed-in user + role badge right. Breadcrumbs sit above each page title, in red, exactly as the mockups.

### Screen 1 — Company dashboard · `/`
- Title "Main dashboard", right-aligned eyebrow "`Q3 · ALL DEPARTMENTS`".
- Horizontal RAG bars, one per Business Unit, sorted as given (Marketing, Sales, Product, Production, Finance, Systems, HR), `%` right-aligned.
- Caption: "Bars show OMAs completed against OMAs set. Click a department to open its team."
- **Click a BU → Screen 2.**

### Screen 2 — Business Unit · `/bu/[buId]`
- Breadcrumb `MAIN DASHBOARD / MARKETING / Q3`. Title = BU name.
- RAG bar per Person in the BU. Caption: "Department roll-up is the average of its people. Click a name to open their OMAs."
- **Click a person → Screen 3.**

### Screen 3 — Person · `/person/[userId]`
- Breadcrumb `MARKETING / SHARINE / Q3`. Title "`{Name} — OMAs`".
- RAG bar per OMA (OMA 1/2/3). Caption: "Three OMAs is the cap — it keeps the review conversation short and honest."
- **Click an OMA → Screen 4.**

### Screen 4 — OMA detail (read) · `/oma/[omaId]`
- Breadcrumb `MARKETING / SHARINE / OMA 1 / Q3`. Title "OMA {n} — detail".
- **Outcome** in a grey panel `#F2F2F2`.
- **Metric** row: `KPI: {measure}` | `Target: {target}` (two columns).
- **Actions**: numbered list, red numerals, grey rows. Show a checkbox where the viewer may tick (own Actions, or Manager/Admin on their scope).
- **Edit** button (red pill, bottom-right) — visible only if the viewer can edit this OMA. → Screen 5.

### Screen 5 — OMA edit · `/oma/[omaId]/edit`
- Breadcrumb `... / EDIT`. Card styled like the Word template: red header bar `#C8102E` with `OMA {n} · Period · Date`.
- Editable: Outcome (textarea), Metric rows (measure + target, add/remove), Action rows (action + due date, add/remove). Enforce the 3-OMA cap at the person level, not here.
- **Save** button (red pill, bottom-right) → back to Screen 4.

---

## 6. Brand tokens (sampled from the mockups + munrofa.com)

```css
:root {
  --mfa-red:        #C8102E;  /* primary: logo, header bars, pills, active breadcrumb, "behind" bars */
  --mfa-ink:        #1A1A1A;  /* headings, body text */
  --mfa-muted:      #696969;  /* captions, secondary text */
  --mfa-track:      #D9D9D9;  /* empty bar track, 0% state */
  --mfa-panel:      #F2F2F2;  /* Outcome/Action row panels */
  --mfa-white:      #FFFFFF;

  --rag-green:      #2E7D32;  /* ≥80 */
  --rag-amber:      #E8A33D;  /* 50–79 */
  --rag-red:        #C8102E;  /* 1–49 (same as brand red) */
}
```

**Type:** page titles in a light-weight serif (Georgia — Munro house style; or `Cormorant`/`Playfair` if you want it sharper). Labels, data, buttons, breadcrumbs in a clean sans (`Inter`, Calibri fallback), semibold for names/%. Breadcrumbs are uppercase, letter-spaced, red for the active crumb and muted grey for the rest.

**Components:** bars are fully-rounded pills; buttons are fully-rounded red pills with white text; generous whitespace, no borders except the red card frame on Screen 5.

---

## 7. Tech stack

Matches your existing muscle memory (Next 14 / TS / Tailwind / Vercel).

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (tokens above as CSS vars + Tailwind theme extension)
- **Prisma** + **PostgreSQL** (Neon or Supabase)
- **Auth.js (NextAuth v5)** — Credentials provider, bcrypt-hashed passwords, role + businessUnitId in the session/JWT
- **Charts:** none needed — the bars are simple CSS/flex divs (`width: {pct}%`). Keep it dependency-light.
- **Deploy:** Vercel + Neon. (Replit works too if you'd rather keep it beside the existing PM section — Postgres + the same schema.)

---

## 8. Prisma schema (starting point)

```prisma
enum Role { ADMIN MANAGER USER }

model User {
  id             String   @id @default(cuid())
  name           String
  email          String   @unique
  passwordHash   String
  role           Role     @default(USER)
  active         Boolean  @default(true)
  businessUnit   BusinessUnit? @relation(fields: [businessUnitId], references: [id])
  businessUnitId String?
  manager        User?    @relation("TeamMembers", fields: [managerId], references: [id])
  managerId      String?
  team           User[]   @relation("TeamMembers")
  omas           OMA[]    @relation("OwnedOMAs")
  createdAt      DateTime @default(now())
}

model BusinessUnit {
  id    String @id @default(cuid())
  name  String @unique
  order Int    @default(0)     // controls dashboard sort order
  users User[]
}

model Period {
  id        String  @id @default(cuid())
  label     String  @unique    // "Q3 2026"
  quarter   Int
  year      Int
  startDate DateTime
  isActive  Boolean @default(false)
  omas      OMA[]
}

model OMA {
  id        String   @id @default(cuid())
  owner     User     @relation("OwnedOMAs", fields: [ownerId], references: [id])
  ownerId   String
  period    Period   @relation(fields: [periodId], references: [id])
  periodId  String
  sequence  Int                 // 1..3, enforced ≤3 per owner+period
  outcome   String
  metrics   Metric[]
  actions   Action[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([ownerId, periodId, sequence])
}

model Metric {
  id      String @id @default(cuid())
  oma     OMA    @relation(fields: [omaId], references: [id], onDelete: Cascade)
  omaId   String
  measure String
  target  String
  order   Int    @default(0)
}

model Action {
  id          String    @id @default(cuid())
  oma         OMA       @relation(fields: [omaId], references: [id], onDelete: Cascade)
  omaId       String
  description String
  dueDate     DateTime?
  completed   Boolean   @default(false)
  completedAt DateTime?
  order       Int       @default(0)
}
```

`progress` is computed in a query helper, not stored — keeps it always correct.

---

## 9. Auth & security

- Passwords bcrypt-hashed; Admin sets an initial password on user creation, User changes it on first login.
- Role + `businessUnitId` + `id` in the JWT. Guard every mutation server-side (never trust the client):
  - **Manager** PATCH on Outcome/Metric or OMA create/delete → verify the OMA's owner is on their team (`owner.managerId === session.id`).
  - **User** may create/edit/reorder/delete/tick **Actions** only on OMAs where `oma.ownerId === session.id`. User attempts to write Outcome/Metric → 403.
  - Admin → unrestricted.
- Middleware protects all routes except `/login`.
- Rate-limit login. POPIA-conscious: this holds staff performance data — no data leaves the tenant, HTTPS only.

---

## 10. Seed data (so the 1→5 click-through works on first run)

Seed from the mockups so the demo path is live immediately:

- **Period:** `Q3 2026` (active), starts 01 Jul 2026.
- **Business Units** (with the mockup company %s emerging from seeded OMAs, roughly): Marketing 70, Sales 50, Product 60, Production 90, Finance 10, Systems 60, HR 30.
- **Marketing team:** Sharine (33%), John (75%), Sam (40%), each reporting to a seeded Manager.
- **Sharine's 3 OMAs:** OMA1 100% (all actions done), OMA2 45%, OMA3 0% (no actions ticked).
- **Sharine OMA1 detail** (Screen 4): Outcome "Marketing delivers a steady flow of qualified leads the sales team can work without rework." · Metric: KPI *Qualified leads* → Target *40 qualified leads by 31 Oct* · Actions: "Rework the lead form and scoring rules", "Run two paid tests per month", "Review the pipeline with Sales every Friday".
- One **Admin** account and one **User** account (Sharine) for testing each role.

> Note: the PDF's Screen 5 shows slightly different sample copy (a Sales-flavoured OMA). Seed Screen 4's version as canonical; the edit form just round-trips whatever's stored.

---

## 11. Build order (milestones for Claude Code)

1. **Scaffold** — Next 14 + TS + Tailwind; wire brand tokens into `tailwind.config` + globals.
2. **DB + Prisma** — schema above, migrate, seed script (§10).
3. **Auth** — Auth.js credentials, login page, session with role/BU, route middleware.
4. **Read path (Screens 1–4)** — dashboard → BU → person → OMA detail, with the progress helper and RAG bars. This is the demo spine; get it perfect.
5. **Edit path (Screen 5)** — Manager/Admin create OMA + edit Outcome/Metric; 3-OMA cap; Users add/edit/reorder/tick their own Actions. Render the form permission-aware: Outcome/Metric fields disabled for Users, Actions section always editable on own OMAs.
6. **Admin console** — user CRUD, assign manager/BU, create Periods/BUs.
7. **Polish** — breadcrumbs, empty states, period switcher, permission-aware Edit button.

Ship 1–4 first as a clickable prototype before touching admin.

---

## 12. Open decisions (your call)

1. ~~User write scope~~ — **RESOLVED** (§2): Users own Actions; Managers own Outcome + Metric.
2. **Progress source.** Default = % of Actions completed. Alternative/v2 = Metric actual-vs-target.
3. **Company roll-up.** Default = simple average of BUs. Alternative = weighted by headcount or by #OMAs.
4. **Period model.** Quarters only, or also months/annual? (Your framework runs quarterly + annual reviews — quarterly is enough for v1.)
5. **Manager self-OMAs.** Does a Manager have their own OMAs set by *their* manager (Admin/exec)? Default = yes; a Manager is also a User in the tree.

---

## 13. Out of scope (v2+)

Metric actual-vs-target tracking · comments/feedback threads on an OMA · review-cycle workflow (PDP / 360 / Annual) · notifications & due-date nudges · audit history · export to the Word OMA template · SharePoint / M365 sync · the four-conversation model (Role Hired For, Career Progression, Individual Production Bonus, Team Bonus) layered on top of OMA.
