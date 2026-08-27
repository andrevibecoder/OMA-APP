# Munro OMA App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the clickable prototype spine of the Munro FA OMA performance app — the read path (company dashboard → business unit → person → OMA detail) plus a permission-aware OMA edit screen, on real auth and a seeded Postgres database.

**Architecture:** Next.js 14 App Router. All reads are async Server Components calling pure data helpers in `src/lib/`. All writes are Server Actions that enforce authorization server-side via one shared `authz` module. Progress percentages are never stored — they are derived on every read by a pure `progress` module. Auth is Auth.js (NextAuth v5) Credentials with a JWT carrying role/BU/manager.

**Tech Stack:** Next.js 14.2.x, TypeScript 5, Tailwind CSS 3.4.x, Prisma 5.x + PostgreSQL (Supabase), Auth.js `next-auth@5.0.0-beta.x`, `bcryptjs`, Vitest 2.x, `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-27-munro-oma-app-design.md` (read it alongside this plan — the plan implements that spec; the source build spec is `munro-oma-app-spec.md` and the mockups are `UX/Screens/screen-1..5.png`).

## Global Constraints

- **App lives in** `munro-oma/` (a new folder inside the repo root `OMA APP/`). All paths below are relative to `munro-oma/` unless said otherwise.
- **Next.js App Router only.** No `pages/` directory. Reads = Server Components; writes = Server Actions in `src/app/**/actions.ts`. No REST API routes except the Auth.js catch-all.
- **No charts / chart libraries.** RAG bars are a `div` with `width: {pct}%`.
- **Progress is computed, never stored.** No `progress` column anywhere.
- **RAG thresholds (exact):** `0` → not-started (track `#D9D9D9`); `1–49` → behind (`#C8102E`); `50–79` → in-progress (`#E8A33D`); `≥ 80` → on-track (`#2E7D32`).
- **Roll-up (exact):** `omaProgress = round(completed / total * 100)`, `0` when `total === 0`. `personProgress = mean(omaProgress over that person's OMAs in the period)`. `buProgress = mean(personProgress over active BU users who have ≥1 OMA in the period)`. `companyProgress` is not displayed in this build but `getCompanyDashboard` returns one row per BU that has ≥1 OMA, ordered by `BusinessUnit.order`.
- **Max 3 OMAs per person per period.** Enforced in the create Server Action AND by `@@unique([ownerId, periodId, sequence])` with `sequence ∈ 1..3`.
- **Ownership split:** Managers write Outcome + Metric for their own team only (`oma.owner.managerId === session.user.id`). Users write only Actions, and only on `oma.ownerId === session.user.id`. Admin writes anything. Read is universal for any authenticated user.
- **Brand tokens (exact hex):** `--mfa-red #C8102E`, `--mfa-ink #1A1A1A`, `--mfa-muted #696969`, `--mfa-track #D9D9D9`, `--mfa-panel #F2F2F2`, `--mfa-white #FFFFFF`, `--rag-green #2E7D32`, `--rag-amber #E8A33D`, `--rag-red #C8102E`.
- **Type:** page titles in Georgia (serif); everything else Inter (via `next/font/google`), semibold for names and percentages. Breadcrumbs uppercase, letter-spaced, active crumb red, rest muted.
- **Prisma datasource:** `provider = "postgresql"`, `url = env("DATABASE_URL")` (pooled, `?pgbouncer=true`), `directUrl = env("DIRECT_URL")` (port 5432). `.env` is gitignored; `.env.example` is committed.
- **Commit after every task** with a Conventional Commit message. Run `npm run lint` and `npx tsc --noEmit` before each commit; both must be clean.
- **Seeded dev password** for all seeded accounts: `munro-dev-2026` (documented in `.env.example` and `README.md`).

---

## File Structure

```
munro-oma/
  .env.example                     committed; DATABASE_URL, DIRECT_URL, AUTH_SECRET + notes
  .gitignore                       Next default + .env
  package.json                     scripts + prisma.seed
  next.config.mjs
  tsconfig.json                    "@/*" -> "src/*"
  tailwind.config.ts               brand tokens in theme.extend.colors
  postcss.config.mjs
  vitest.config.ts                 environment "node", alias "@/"
  README.md                        setup: Supabase strings, migrate, seed, dev, test
  prisma/
    schema.prisma                  spec §4 model, verbatim
    seed.ts                        spec §7 seed
    migrations/                    generated
  src/
    middleware.ts                  Auth.js route guard, matcher excludes /login + assets
    auth.ts                        NextAuth() config; exports handlers, auth, signIn, signOut
    auth.config.ts                 edge-safe callbacks (authorized, jwt, session) split out
    app/
      globals.css                  Tailwind directives + :root brand tokens
      layout.tsx                   <html>, fonts, wraps authenticated pages with <AppHeader>
      page.tsx                     Screen 1 — company dashboard
      login/page.tsx               credentials form (client) + login Server Action
      api/auth/[...nextauth]/route.ts   export { GET, POST } = handlers
      bu/[buId]/page.tsx           Screen 2 — business unit
      person/[userId]/page.tsx     Screen 3 — person OMAs (+ New OMA control)
      person/[userId]/actions.ts   createOma Server Action
      oma/[omaId]/page.tsx         Screen 4 — OMA detail (read)
      oma/[omaId]/actions.ts       tickAction, saveOma Server Actions
      oma/[omaId]/edit/page.tsx    Screen 5 — OMA edit
    components/
      AppHeader.tsx                logo, PeriodSelector, user name, RoleBadge
      Breadcrumbs.tsx              items: { label, href? }[]
      PageTitle.tsx                serif h1
      RagBar.tsx                   label + pct pill bar, optional href (whole row links)
      RoleBadge.tsx                ADMIN | MANAGER | USER pill
      PeriodSelector.tsx           <select> that sets ?period=
      OmaEditForm.tsx              client; permission-aware fields; calls saveOma
      ActionCheckbox.tsx           client; optimistic tick, calls tickAction
    lib/
      db.ts                        PrismaClient singleton
      progress.ts                  ragState, omaProgress, mean, roll-up shapers
      authz.ts                     canEditOutcomeMetric, canEditActions, canCreateOMA, canEditProfile
      periods.ts                   getActivePeriod, resolvePeriod(searchParam)
      queries.ts                   getCompanyDashboard, getBusinessUnit, getPerson, getOma
      session.ts                   getSessionUser() -> typed { id, name, role, businessUnitId, managerId }
    types.ts                       shared TS types (SessionUser, Role, RagState, ...)
  tests/
    progress.test.ts
    authz.test.ts
    queries.integration.test.ts    requires DATABASE_URL; seeds then asserts
```

---

## Task 1: Scaffold + brand system

**Files:**
- Create: `munro-oma/package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`, `README.md`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (temporary placeholder), `src/types.ts`
- Create: `src/components/PageTitle.tsx`, `src/components/RagBar.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/types.ts`: `export type Role = "ADMIN" | "MANAGER" | "USER"`; `export type RagState = "not-started" | "behind" | "in-progress" | "on-track"`; `export interface SessionUser { id: string; name: string; role: Role; businessUnitId: string | null; managerId: string | null }`
  - `<PageTitle>{children}</PageTitle>` → serif `<h1>`.
  - `<RagBar label={string} value={number} href?={string} />` — renders a row: bold label left, full-width grey track with a coloured fill `width: {value}%` (colour from `ragState(value)`), `{value}%` right-aligned semibold. If `href`, the whole row is a `<Link>`.

- [ ] **Step 1: Create the Next app skeleton by hand**

Create `munro-oma/package.json`:

```json
{
  "name": "munro-oma",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": {
    "next": "14.2.15",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "next-auth": "5.0.0-beta.25",
    "@prisma/client": "5.22.0",
    "bcryptjs": "2.4.3",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@types/node": "20.16.11",
    "@types/bcryptjs": "2.4.6",
    "tailwindcss": "3.4.14",
    "postcss": "8.4.47",
    "autoprefixer": "10.4.20",
    "prisma": "5.22.0",
    "tsx": "4.19.1",
    "vitest": "2.1.3",
    "eslint": "8.57.1",
    "eslint-config-next": "14.2.15"
  }
}
```

Create `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `postcss.config.mjs`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

Create `.gitignore`:

```
node_modules
.next
.env
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 2: Install dependencies**

Run: `cd munro-oma && npm install`
Expected: completes; `node_modules` present; `npx prisma --version` and `npx next --version` both resolve.

- [ ] **Step 3: Wire brand tokens into Tailwind + globals**

Create `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mfa: {
          red: "#C8102E",
          ink: "#1A1A1A",
          muted: "#696969",
          track: "#D9D9D9",
          panel: "#F2F2F2",
          white: "#FFFFFF",
        },
        rag: {
          green: "#2E7D32",
          amber: "#E8A33D",
          red: "#C8102E",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["var(--font-inter)", "Inter", "Calibri", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config
```

Create `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --mfa-red: #C8102E;
  --mfa-ink: #1A1A1A;
  --mfa-muted: #696969;
  --mfa-track: #D9D9D9;
  --mfa-panel: #F2F2F2;
  --mfa-white: #FFFFFF;
  --rag-green: #2E7D32;
  --rag-amber: #E8A33D;
  --rag-red: #C8102E;
}

body {
  color: var(--mfa-ink);
  background: var(--mfa-white);
}
```

- [ ] **Step 4: Create `src/types.ts`**

```ts
export type Role = "ADMIN" | "MANAGER" | "USER"

export type RagState = "not-started" | "behind" | "in-progress" | "on-track"

export interface SessionUser {
  id: string
  name: string
  role: Role
  businessUnitId: string | null
  managerId: string | null
}
```

- [ ] **Step 5: Create the root layout with fonts**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = { title: "Munro FA — OMA" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Create `<PageTitle>` and `<RagBar>`**

Create `src/components/PageTitle.tsx`:

```tsx
export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="font-serif text-4xl font-light text-mfa-ink">{children}</h1>
}
```

Create `src/components/RagBar.tsx` (imports `ragState` — but that lands in Task 3; for now inline the threshold logic here and Task 3 Step "refactor" replaces it):

```tsx
import Link from "next/link"

function barColor(v: number): string {
  if (v === 0) return "transparent"
  if (v <= 49) return "var(--rag-red)"
  if (v <= 79) return "var(--rag-amber)"
  return "var(--rag-green)"
}

export function RagBar({ label, value, href }: { label: string; value: number; href?: string }) {
  const row = (
    <div className="flex items-center gap-6 py-3">
      <span className="w-40 shrink-0 font-semibold">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-full bg-mfa-track">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: barColor(value) }} />
      </div>
      <span className="w-14 shrink-0 text-right font-semibold">{value}%</span>
    </div>
  )
  return href ? <Link href={href} className="block hover:opacity-80">{row}</Link> : row
}
```

- [ ] **Step 7: Temporary home page + `.env.example` + README**

Create `src/app/page.tsx`:

```tsx
import { PageTitle } from "@/components/PageTitle"
import { RagBar } from "@/components/RagBar"

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <PageTitle>Main dashboard</PageTitle>
      <div className="mt-8">
        <RagBar label="Production" value={90} />
        <RagBar label="Sales" value={50} />
        <RagBar label="HR" value={30} />
        <RagBar label="Finance" value={0} />
      </div>
    </main>
  )
}
```

Create `.env.example`:

```
# Supabase → Settings → Database → Connection string → URI
# Pooled (port 6543, host contains "pooler"); append ?pgbouncer=true
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true"
# Direct (port 5432) — used for migrations & seeding
DIRECT_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
# Generate with: openssl rand -base64 33
AUTH_SECRET="replace-me"

# Seeded accounts (all use this password): admin@munrofa.com / manager@munrofa.com / sharine@munrofa.com
# SEED_PASSWORD is fixed in code as "munro-dev-2026"
```

Create `README.md` with sections: Prerequisites (Node 20, a Supabase project), Setup (`cp .env.example .env`, fill the three vars, `npm install`, `npm run db:migrate`, `npm run db:seed`), Run (`npm run dev` → http://localhost:3000, log in as `admin@munrofa.com` / `munro-dev-2026`), Test (`npm run test`).

- [ ] **Step 8: Verify dev server renders**

Run: `npm run dev` then in another shell `curl -s localhost:3000 | grep -o "Main dashboard"`
Expected: prints `Main dashboard`. Stop the dev server.
Run: `npm run lint && npm run typecheck`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
cd "/Users/andrevonmollendorff/Desktop/Claude Business/OMA APP"
git add munro-oma
git commit -m "feat: scaffold Next 14 app with Munro brand system"
```

---

## Task 2: Prisma schema + client singleton + migration

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`
- Create: `prisma/migrations/**` (generated)

**Interfaces:**
- Consumes: `DATABASE_URL`, `DIRECT_URL` from `.env`.
- Produces:
  - `src/lib/db.ts`: `export const db: PrismaClient` (singleton).
  - Prisma models: `User`, `BusinessUnit`, `Period`, `OMA`, `Metric`, `Action`; enum `Role`. Field names exactly as spec §4 / build-spec §8.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  ADMIN
  MANAGER
  USER
}

model User {
  id             String        @id @default(cuid())
  name           String
  email          String        @unique
  passwordHash   String
  role           Role          @default(USER)
  active         Boolean       @default(true)
  businessUnit   BusinessUnit? @relation(fields: [businessUnitId], references: [id])
  businessUnitId String?
  manager        User?         @relation("TeamMembers", fields: [managerId], references: [id])
  managerId      String?
  team           User[]        @relation("TeamMembers")
  omas           OMA[]         @relation("OwnedOMAs")
  createdAt      DateTime      @default(now())
}

model BusinessUnit {
  id    String @id @default(cuid())
  name  String @unique
  order Int    @default(0)
  users User[]
}

model Period {
  id        String   @id @default(cuid())
  label     String   @unique
  quarter   Int
  year      Int
  startDate DateTime
  isActive  Boolean  @default(false)
  omas      OMA[]
}

model OMA {
  id        String   @id @default(cuid())
  owner     User     @relation("OwnedOMAs", fields: [ownerId], references: [id])
  ownerId   String
  period    Period   @relation(fields: [periodId], references: [id])
  periodId  String
  sequence  Int
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

- [ ] **Step 2: Confirm `.env` is populated**

Run: `test -f .env && grep -q DATABASE_URL .env && grep -q DIRECT_URL .env && echo OK`
Expected: `OK`. If not, STOP and ask the user for the Supabase `DATABASE_URL` and `DIRECT_URL` (see `.env.example`).

- [ ] **Step 3: Create and run the first migration**

Run: `npm run db:migrate -- --name init`
Expected: creates `prisma/migrations/<ts>_init/migration.sql`, applies it, generates the client. No error.

- [ ] **Step 4: Create the Prisma client singleton**

Create `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
```

- [ ] **Step 5: Verify the client connects**

Run: `npx tsx -e "import{db}from'./src/lib/db';db.businessUnit.count().then(n=>{console.log('rows',n);process.exit(0)})"`
Expected: prints `rows 0`. (Confirms schema is live and the pooled URL works.)
Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add munro-oma
git commit -m "feat: add Prisma schema, Postgres migration, client singleton"
```

---

## Task 3: `progress.ts` — RAG + roll-up logic (TDD)

**Files:**
- Create: `src/lib/progress.ts`
- Test: `tests/progress.test.ts`
- Create: `vitest.config.ts`
- Modify: `src/components/RagBar.tsx` (replace inline `barColor` with `ragState`)

**Interfaces:**
- Consumes: `RagState` from `src/types.ts`.
- Produces:
  - `ragState(pct: number): RagState`
  - `ragColorVar(state: RagState): string` → CSS var string, e.g. `"var(--rag-green)"`; `not-started` → `"transparent"`.
  - `omaProgress(oma: { actions: { completed: boolean }[] }): number`
  - `mean(values: number[]): number` → `0` when empty; result rounded to nearest integer.
  - `personProgress(omas: { actions: { completed: boolean }[] }[]): number` → `mean(omas.map(omaProgress))`.
  - `buProgress(people: { omas: { actions: { completed: boolean }[] }[] }[]): number` → mean of `personProgress` over people **with ≥1 OMA**.

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
})
```

- [ ] **Step 2: Write the failing test**

Create `tests/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ragState, omaProgress, mean, personProgress, buProgress } from "@/lib/progress"

const done = { completed: true }
const todo = { completed: false }

describe("ragState", () => {
  it("maps thresholds exactly", () => {
    expect(ragState(0)).toBe("not-started")
    expect(ragState(1)).toBe("behind")
    expect(ragState(49)).toBe("behind")
    expect(ragState(50)).toBe("in-progress")
    expect(ragState(79)).toBe("in-progress")
    expect(ragState(80)).toBe("on-track")
    expect(ragState(100)).toBe("on-track")
  })
})

describe("omaProgress", () => {
  it("is 0 when there are no actions", () => {
    expect(omaProgress({ actions: [] })).toBe(0)
  })
  it("rounds completed/total", () => {
    expect(omaProgress({ actions: [done, todo, todo] })).toBe(33)
    expect(omaProgress({ actions: [done, done, done] })).toBe(100)
    expect(omaProgress({ actions: [done, todo] })).toBe(50)
  })
})

describe("mean", () => {
  it("is 0 for empty", () => expect(mean([])).toBe(0))
  it("rounds", () => expect(mean([100, 45, 0])).toBe(48))
})

describe("personProgress", () => {
  it("averages OMA progress", () => {
    expect(personProgress([{ actions: [done] }, { actions: [todo] }, { actions: [] }])).toBe(33)
  })
})

describe("buProgress", () => {
  it("skips people with no OMAs", () => {
    const withOmas = { omas: [{ actions: [done] }] } // 100
    const noOmas = { omas: [] }
    expect(buProgress([withOmas, noOmas])).toBe(100)
  })
  it("is 0 when nobody has OMAs", () => {
    expect(buProgress([{ omas: [] }, { omas: [] }])).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- tests/progress.test.ts`
Expected: FAIL — `Cannot find module '@/lib/progress'` (or similar).

- [ ] **Step 4: Write minimal implementation**

Create `src/lib/progress.ts`:

```ts
import type { RagState } from "@/types"

export function ragState(pct: number): RagState {
  if (pct <= 0) return "not-started"
  if (pct <= 49) return "behind"
  if (pct <= 79) return "in-progress"
  return "on-track"
}

export function ragColorVar(state: RagState): string {
  switch (state) {
    case "not-started":
      return "transparent"
    case "behind":
      return "var(--rag-red)"
    case "in-progress":
      return "var(--rag-amber)"
    case "on-track":
      return "var(--rag-green)"
  }
}

type ActionLike = { completed: boolean }
type OmaLike = { actions: ActionLike[] }

export function omaProgress(oma: OmaLike): number {
  const total = oma.actions.length
  if (total === 0) return 0
  const completed = oma.actions.filter((a) => a.completed).length
  return Math.round((completed / total) * 100)
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length)
}

export function personProgress(omas: OmaLike[]): number {
  return mean(omas.map(omaProgress))
}

export function buProgress(people: { omas: OmaLike[] }[]): number {
  const withOmas = people.filter((p) => p.omas.length > 0)
  return mean(withOmas.map((p) => personProgress(p.omas)))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/progress.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Refactor `<RagBar>` to use the shared logic**

In `src/components/RagBar.tsx`, delete the local `barColor` function and replace with:

```tsx
import { ragColorVar, ragState } from "@/lib/progress"
// ...
// in the fill div:
style={{ width: `${value}%`, background: ragColorVar(ragState(value)) }}
```

- [ ] **Step 7: Verify nothing broke**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add munro-oma
git commit -m "feat: add progress + RAG roll-up logic with tests"
```

---

## Task 4: `authz.ts` — permission rules (TDD)

**Files:**
- Create: `src/lib/authz.ts`
- Test: `tests/authz.test.ts`

**Interfaces:**
- Consumes: `SessionUser`, `Role` from `src/types.ts`.
- Produces (all pure, no DB):
  - `type OmaAuthShape = { ownerId: string; owner: { managerId: string | null } }`
  - `canEditOutcomeMetric(user: SessionUser, oma: OmaAuthShape): boolean`
  - `canEditActions(user: SessionUser, oma: OmaAuthShape): boolean`
  - `canCreateOMA(user: SessionUser, target: { id: string; managerId: string | null }, currentOmaCount: number): boolean` — false when `currentOmaCount >= 3`.
  - `canEditProfile(user: SessionUser, userId: string): boolean`
  - `canEditOma(user, oma): boolean` = `canEditOutcomeMetric || canEditActions` (drives the Edit button).

- [ ] **Step 1: Write the failing test**

Create `tests/authz.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  canCreateOMA,
  canEditActions,
  canEditOma,
  canEditOutcomeMetric,
  canEditProfile,
  type OmaAuthShape,
} from "@/lib/authz"
import type { SessionUser } from "@/types"

const admin: SessionUser = { id: "admin", name: "A", role: "ADMIN", businessUnitId: "bu1", managerId: null }
const mgr: SessionUser = { id: "mgr", name: "M", role: "MANAGER", businessUnitId: "bu1", managerId: "boss" }
const user: SessionUser = { id: "u1", name: "U", role: "USER", businessUnitId: "bu1", managerId: "mgr" }

const omaOfU1: OmaAuthShape = { ownerId: "u1", owner: { managerId: "mgr" } }
const omaOfOther: OmaAuthShape = { ownerId: "u2", owner: { managerId: "other-mgr" } }

describe("canEditOutcomeMetric", () => {
  it("admin: any", () => expect(canEditOutcomeMetric(admin, omaOfOther)).toBe(true))
  it("manager: own team only", () => {
    expect(canEditOutcomeMetric(mgr, omaOfU1)).toBe(true)
    expect(canEditOutcomeMetric(mgr, omaOfOther)).toBe(false)
  })
  it("user: never", () => expect(canEditOutcomeMetric(user, omaOfU1)).toBe(false))
})

describe("canEditActions", () => {
  it("user: own OMA only", () => {
    expect(canEditActions(user, omaOfU1)).toBe(true)
    expect(canEditActions(user, omaOfOther)).toBe(false)
  })
  it("manager: own team", () => expect(canEditActions(mgr, omaOfU1)).toBe(true))
  it("admin: any", () => expect(canEditActions(admin, omaOfOther)).toBe(true))
})

describe("canCreateOMA", () => {
  const target = { id: "u1", managerId: "mgr" }
  it("manager for own team under the cap", () => expect(canCreateOMA(mgr, target, 2)).toBe(true))
  it("blocked at the cap", () => expect(canCreateOMA(mgr, target, 3)).toBe(false))
  it("manager not for other teams", () => expect(canCreateOMA(mgr, { id: "u2", managerId: "x" }, 0)).toBe(false))
  it("user never", () => expect(canCreateOMA(user, target, 0)).toBe(false))
  it("admin any team under cap", () => expect(canCreateOMA(admin, { id: "u2", managerId: "x" }, 1)).toBe(true))
})

describe("canEditProfile", () => {
  it("self only", () => {
    expect(canEditProfile(user, "u1")).toBe(true)
    expect(canEditProfile(user, "u2")).toBe(false)
  })
})

describe("canEditOma", () => {
  it("true if either sub-permission is true", () => {
    expect(canEditOma(user, omaOfU1)).toBe(true)
    expect(canEditOma(user, omaOfOther)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/authz.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/authz.ts`:

```ts
import type { SessionUser } from "@/types"

export type OmaAuthShape = { ownerId: string; owner: { managerId: string | null } }

function managesOwner(user: SessionUser, oma: OmaAuthShape): boolean {
  return oma.owner.managerId !== null && oma.owner.managerId === user.id
}

export function canEditOutcomeMetric(user: SessionUser, oma: OmaAuthShape): boolean {
  if (user.role === "ADMIN") return true
  if (user.role === "MANAGER") return managesOwner(user, oma)
  return false
}

export function canEditActions(user: SessionUser, oma: OmaAuthShape): boolean {
  if (user.role === "ADMIN") return true
  if (user.role === "MANAGER") return managesOwner(user, oma)
  return oma.ownerId === user.id
}

export function canCreateOMA(
  user: SessionUser,
  target: { id: string; managerId: string | null },
  currentOmaCount: number,
): boolean {
  if (currentOmaCount >= 3) return false
  if (user.role === "ADMIN") return true
  if (user.role === "MANAGER") return target.managerId !== null && target.managerId === user.id
  return false
}

export function canEditProfile(user: SessionUser, userId: string): boolean {
  return user.id === userId
}

export function canEditOma(user: SessionUser, oma: OmaAuthShape): boolean {
  return canEditOutcomeMetric(user, oma) || canEditActions(user, oma)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/authz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add munro-oma
git commit -m "feat: add authorization rules with tests"
```

---

## Task 5: Seed script

**Files:**
- Create: `prisma/seed.ts`

**Interfaces:**
- Consumes: `db` from `src/lib/db.ts`, `bcryptjs`.
- Produces: seeded rows. Fixed facts that later tasks assert against:
  - Period `Q3 2026` (`isActive: true`, `startDate` = 2026-07-01, quarter 3, year 2026).
  - 7 BUs, `order` 0..6: Marketing, Sales, Product, Production, Finance, Systems, HR.
  - Users: `admin@munrofa.com` (ADMIN, no BU), `manager@munrofa.com` (MANAGER, Marketing, `managerId` = admin), `sharine@munrofa.com` / `john@munrofa.com` / `sam@munrofa.com` (USER, Marketing, `managerId` = manager). Plus one synthetic USER per other BU.
  - Sharine OMAs, `sequence` 1..3:
    - OMA 1 — outcome "Marketing delivers a steady flow of qualified leads the sales team can work without rework."; one metric measure "Qualified leads" target "40 qualified leads by 31 Oct"; 3 actions ("Rework the lead form and scoring rules", "Run two paid tests per month", "Review the pipeline with Sales every Friday") **all `completed: true`** → omaProgress 100.
    - OMA 2 — any outcome/metric; actions such that progress rounds to **45** (e.g. 9 actions, 4 completed → 44; use 20 actions 9 completed → 45; simplest: 11 actions, 5 completed → 45).
    - OMA 3 — any outcome/metric; **≥1 action, none completed** → progress 0 (grey track).
  - John: OMA(s) → personProgress rounds to ~75 (e.g. one OMA, 4 actions, 3 completed → 75).
  - Sam: OMA(s) → personProgress rounds to ~40 (e.g. one OMA, 5 actions, 2 completed → 40).
  - Other BUs' synthetic users: one OMA each with action counts giving roughly Production 90, Systems 60, Product 60, Sales 50, HR 30, Finance 10.
  - All accounts: `passwordHash = bcrypt.hashSync("munro-dev-2026", 10)`.

- [ ] **Step 1: Write `prisma/seed.ts`**

```ts
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const db = new PrismaClient()
const HASH = bcrypt.hashSync("munro-dev-2026", 10)

// n actions, k completed
function actions(n: number, k: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => ({
    description: `${prefix} action ${i + 1}`,
    completed: i < k,
    completedAt: i < k ? new Date() : null,
    order: i,
  }))
}

async function main() {
  // wipe (respect FK order)
  await db.action.deleteMany()
  await db.metric.deleteMany()
  await db.oMA.deleteMany()
  await db.user.deleteMany()
  await db.period.deleteMany()
  await db.businessUnit.deleteMany()

  const period = await db.period.create({
    data: { label: "Q3 2026", quarter: 3, year: 2026, startDate: new Date("2026-07-01"), isActive: true },
  })

  const buNames = ["Marketing", "Sales", "Product", "Production", "Finance", "Systems", "HR"]
  const bus: Record<string, string> = {}
  for (let i = 0; i < buNames.length; i++) {
    const bu = await db.businessUnit.create({ data: { name: buNames[i], order: i } })
    bus[buNames[i]] = bu.id
  }

  const admin = await db.user.create({
    data: { name: "Admin", email: "admin@munrofa.com", passwordHash: HASH, role: "ADMIN" },
  })
  const manager = await db.user.create({
    data: {
      name: "Manager",
      email: "manager@munrofa.com",
      passwordHash: HASH,
      role: "MANAGER",
      businessUnitId: bus.Marketing,
      managerId: admin.id,
    },
  })

  const mkUser = (name: string, email: string, buId: string) =>
    db.user.create({
      data: { name, email, passwordHash: HASH, role: "USER", businessUnitId: buId, managerId: manager.id },
    })

  const sharine = await mkUser("Sharine", "sharine@munrofa.com", bus.Marketing)
  const john = await mkUser("John", "john@munrofa.com", bus.Marketing)
  const sam = await mkUser("Sam", "sam@munrofa.com", bus.Marketing)

  // Sharine OMA 1 — 100%
  await db.oMA.create({
    data: {
      ownerId: sharine.id,
      periodId: period.id,
      sequence: 1,
      outcome:
        "Marketing delivers a steady flow of qualified leads the sales team can work without rework.",
      metrics: { create: [{ measure: "Qualified leads", target: "40 qualified leads by 31 Oct", order: 0 }] },
      actions: {
        create: [
          { description: "Rework the lead form and scoring rules", completed: true, completedAt: new Date(), order: 0 },
          { description: "Run two paid tests per month", completed: true, completedAt: new Date(), order: 1 },
          { description: "Review the pipeline with Sales every Friday", completed: true, completedAt: new Date(), order: 2 },
        ],
      },
    },
  })

  // Sharine OMA 2 — 45% (11 actions, 5 done)
  await db.oMA.create({
    data: {
      ownerId: sharine.id,
      periodId: period.id,
      sequence: 2,
      outcome: "The brand shows up consistently across every channel prospects touch.",
      metrics: { create: [{ measure: "Channel audit score", target: "90% by 30 Sep", order: 0 }] },
      actions: { create: actions(11, 5, "Brand") },
    },
  })

  // Sharine OMA 3 — 0% (3 actions, none done)
  await db.oMA.create({
    data: {
      ownerId: sharine.id,
      periodId: period.id,
      sequence: 3,
      outcome: "Marketing can prove its contribution to revenue.",
      metrics: { create: [{ measure: "Attributed pipeline", target: "R2m by 31 Oct", order: 0 }] },
      actions: { create: actions(3, 0, "Attribution") },
    },
  })

  // John — 75% (1 OMA, 4 actions, 3 done)
  await db.oMA.create({
    data: {
      ownerId: john.id,
      periodId: period.id,
      sequence: 1,
      outcome: "Content engine ships on a predictable cadence.",
      metrics: { create: [{ measure: "Posts published", target: "8 per month", order: 0 }] },
      actions: { create: actions(4, 3, "Content") },
    },
  })

  // Sam — 40% (1 OMA, 5 actions, 2 done)
  await db.oMA.create({
    data: {
      ownerId: sam.id,
      periodId: period.id,
      sequence: 1,
      outcome: "Events generate qualified conversations for Sales.",
      metrics: { create: [{ measure: "Booked meetings", target: "15 per event", order: 0 }] },
      actions: { create: actions(5, 2, "Events") },
    },
  })

  // Other BUs — one synthetic user + one OMA to approximate the dashboard spread
  const spread: Record<string, [number, number]> = {
    Sales: [10, 5], // 50
    Product: [10, 6], // 60
    Production: [10, 9], // 90
    Finance: [10, 1], // 10
    Systems: [10, 6], // 60
    HR: [10, 3], // 30
  }
  for (const [bu, [n, k]] of Object.entries(spread)) {
    const u = await db.user.create({
      data: {
        name: `${bu} Lead`,
        email: `${bu.toLowerCase()}@munrofa.com`,
        passwordHash: HASH,
        role: "USER",
        businessUnitId: bus[bu],
        managerId: manager.id,
      },
    })
    await db.oMA.create({
      data: {
        ownerId: u.id,
        periodId: period.id,
        sequence: 1,
        outcome: `${bu} delivers on its core commitment for the quarter.`,
        metrics: { create: [{ measure: "Primary KPI", target: "On target by 31 Oct", order: 0 }] },
        actions: { create: actions(n, k, bu) },
      },
    })
  }

  console.log("Seed complete.")
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
```

- [ ] **Step 2: Run the seed**

Run: `npm run db:seed`
Expected: prints `Seed complete.` with no error.

- [ ] **Step 3: Verify the canonical numbers**

Run:
```bash
npx tsx -e "
import{db}from'./src/lib/db';
import{personProgress}from'./src/lib/progress';
(async()=>{
 const s=await db.user.findUniqueOrThrow({where:{email:'sharine@munrofa.com'},include:{omas:{include:{actions:true}}}});
 console.log('sharine omas', s.omas.sort((a,b)=>a.sequence-b.sequence).map(o=>o.actions.filter(x=>x.completed).length+'/'+o.actions.length));
 console.log('sharine person', personProgress(s.omas));
 process.exit(0);
})()"
```
Expected: `sharine omas [ '3/3', '5/11', '0/3' ]` and `sharine person 48`.

- [ ] **Step 4: Commit**

```bash
git add munro-oma
git commit -m "feat: add seed script for the Screen 1-5 click-through"
```

---

## Task 6: Auth.js credentials + login + middleware + session helper

**Files:**
- Create: `src/auth.config.ts`, `src/auth.ts`, `src/middleware.ts`, `src/lib/session.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`
- Create: `src/types/next-auth.d.ts`
- Modify: `src/app/layout.tsx` (no visual change yet; keep as is)

**Interfaces:**
- Consumes: `db`, `bcryptjs`, `SessionUser`/`Role` from `src/types.ts`.
- Produces:
  - `src/auth.ts`: `export const { handlers, auth, signIn, signOut }`.
  - `src/lib/session.ts`: `export async function getSessionUser(): Promise<SessionUser>` — throws/redirects to `/login` if unauthenticated; returns the typed user otherwise.
  - JWT + session carry `id`, `role`, `businessUnitId`, `managerId` (and `name`).
  - `src/app/login/actions.ts`: `export async function login(prevState, formData): Promise<{ error?: string }>` — calls `signIn("credentials", ...)`.

- [ ] **Step 1: Augment the NextAuth types**

Create `src/types/next-auth.d.ts`:

```ts
import type { Role } from "@/types"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name: string
      role: Role
      businessUnitId: string | null
      managerId: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: Role
    businessUnitId: string | null
    managerId: string | null
  }
}
```

- [ ] **Step 2: Write the edge-safe config**

Create `src/auth.config.ts`:

```ts
import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isLogin = nextUrl.pathname.startsWith("/login")
      if (isLogin) return isLoggedIn ? Response.redirect(new URL("/", nextUrl)) : true
      return isLoggedIn
    },
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id
        token.role = (user as { role: import("@/types").Role }).role
        token.businessUnitId = (user as { businessUnitId: string | null }).businessUnitId
        token.managerId = (user as { managerId: string | null }).managerId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.businessUnitId = token.businessUnitId
      session.user.managerId = token.managerId
      return session
    },
  },
} satisfies NextAuthConfig
```

- [ ] **Step 3: Write the full auth config with the Credentials provider**

Create `src/auth.ts`:

```ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "@/auth.config"
import { db } from "@/lib/db"

const schema = z.object({ email: z.string().email(), password: z.string().min(1) })

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return null
        const user = await db.user.findUnique({ where: { email: parsed.data.email } })
        if (!user || !user.active) return null
        if (!bcrypt.compareSync(parsed.data.password, user.passwordHash)) return null
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          businessUnitId: user.businessUnitId,
          managerId: user.managerId,
        }
      },
    }),
  ],
})
```

- [ ] **Step 4: Route handler + middleware**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

Create `src/middleware.ts`:

```ts
import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```

- [ ] **Step 5: Session helper**

Create `src/lib/session.ts`:

```ts
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import type { SessionUser } from "@/types"

export async function getSessionUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const u = session.user
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    businessUnitId: u.businessUnitId,
    managerId: u.managerId,
  }
}
```

- [ ] **Step 6: Login page + action**

Create `src/app/login/actions.ts`:

```ts
"use server"

import { AuthError } from "next-auth"
import { signIn } from "@/auth"

export async function login(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    })
    return {}
  } catch (err) {
    if (err instanceof AuthError) return { error: "Wrong email or password." }
    throw err
  }
}
```

Create `src/app/login/page.tsx`:

```tsx
"use client"

import { useActionState } from "react"
import { login } from "./actions"

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {})
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-8">
      <h1 className="font-serif text-3xl font-light">Munro FA</h1>
      <p className="mt-1 text-mfa-muted">OMA performance</p>
      <form action={action} className="mt-8 space-y-4">
        <input name="email" type="email" required placeholder="Email"
          className="w-full rounded-lg border border-mfa-track px-4 py-2" />
        <input name="password" type="password" required placeholder="Password"
          className="w-full rounded-lg border border-mfa-track px-4 py-2" />
        {state.error && <p className="text-sm text-mfa-red">{state.error}</p>}
        <button type="submit" disabled={pending}
          className="w-full rounded-full bg-mfa-red px-4 py-2 font-semibold text-white disabled:opacity-60">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 7: Generate `AUTH_SECRET` and verify login end-to-end**

Run: `grep -q '^AUTH_SECRET="replace-me"' .env && echo "SET AUTH_SECRET" || echo ok`
If `SET AUTH_SECRET`: run `openssl rand -base64 33` and put the value in `.env` as `AUTH_SECRET`.
Run: `npm run dev`, then:
```bash
curl -s -c /tmp/j -b /tmp/j localhost:3000/login | grep -o "Sign in"          # login page renders
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/                        # 307 -> /login when unauthenticated
```
Expected: `Sign in` printed; `307` for `/`.
Then in a browser: log in as `admin@munrofa.com` / `munro-dev-2026` → lands on `/` (the temp dashboard). Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add munro-oma
git commit -m "feat: add Auth.js credentials login, route middleware, session helper"
```

---

## Task 7: Shared UI components

**Files:**
- Create: `src/components/Breadcrumbs.tsx`, `src/components/RoleBadge.tsx`, `src/components/PeriodSelector.tsx`, `src/components/AppHeader.tsx`
- Create: `src/lib/periods.ts`
- Modify: `src/app/layout.tsx` — render `<AppHeader>` above `{children}` for all pages except `/login` (use a route group or a check in the page; simplest: move authenticated pages under a `(app)` route group with its own layout).

**Interfaces:**
- Consumes: `getSessionUser`, `db`, `SessionUser`.
- Produces:
  - `src/lib/periods.ts`:
    - `getActivePeriod(): Promise<{ id: string; label: string; startDate: Date }>` — the `isActive` period; falls back to the most recent by `year,quarter`.
    - `listPeriods(): Promise<{ id: string; label: string }[]>` — all, newest first.
    - `resolvePeriodId(searchParam: string | undefined): Promise<string>` — the param if it is a real period id, else the active period's id.
  - `<Breadcrumbs items={{ label: string; href?: string }[]} />` — uppercase, letter-spaced; last item (or any without `href`) is red; the rest are muted links with ` / ` separators.
  - `<RoleBadge role={Role} />` — small uppercase pill.
  - `<PeriodSelector periods value />` — client `<select>`; on change, pushes `?period=<id>` preserving the current path.
  - `<AppHeader />` — server component: "Munro FA" wordmark (links to `/`), right side `<PeriodSelector>` + user name + `<RoleBadge>`.

- [ ] **Step 1: `src/lib/periods.ts`**

```ts
import { db } from "@/lib/db"

export async function getActivePeriod() {
  const active = await db.period.findFirst({ where: { isActive: true } })
  if (active) return active
  const latest = await db.period.findFirst({ orderBy: [{ year: "desc" }, { quarter: "desc" }] })
  if (!latest) throw new Error("No periods exist — run the seed.")
  return latest
}

export async function listPeriods() {
  return db.period.findMany({ orderBy: [{ year: "desc" }, { quarter: "desc" }], select: { id: true, label: true } })
}

export async function resolvePeriodId(searchParam: string | undefined): Promise<string> {
  if (searchParam) {
    const hit = await db.period.findUnique({ where: { id: searchParam }, select: { id: true } })
    if (hit) return hit.id
  }
  return (await getActivePeriod()).id
}
```

- [ ] **Step 2: `<Breadcrumbs>` and `<RoleBadge>`**

Create `src/components/Breadcrumbs.tsx`:

```tsx
import Link from "next/link"

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
      {items.map((it, i) => {
        const last = i === items.length - 1
        const cls = last || !it.href ? "text-mfa-red" : "text-mfa-muted hover:underline"
        return (
          <span key={i} className="flex items-center gap-2">
            {it.href && !last ? <Link href={it.href} className={cls}>{it.label}</Link> : <span className={cls}>{it.label}</span>}
            {!last && <span className="text-mfa-track">/</span>}
          </span>
        )
      })}
    </nav>
  )
}
```

Create `src/components/RoleBadge.tsx`:

```tsx
import type { Role } from "@/types"

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="rounded-full border border-mfa-track px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-mfa-muted">
      {role}
    </span>
  )
}
```

- [ ] **Step 3: `<PeriodSelector>` (client)**

Create `src/components/PeriodSelector.tsx`:

```tsx
"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function PeriodSelector({ periods, value }: { periods: { id: string; label: string }[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params)
    next.set("period", e.target.value)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <select value={value} onChange={onChange}
      className="rounded-full border border-mfa-track px-3 py-1 text-sm font-semibold">
      {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  )
}
```

- [ ] **Step 4: `<AppHeader>` + `(app)` route group**

Create `src/components/AppHeader.tsx`:

```tsx
import Link from "next/link"
import { getSessionUser } from "@/lib/session"
import { listPeriods, resolvePeriodId } from "@/lib/periods"
import { PeriodSelector } from "./PeriodSelector"
import { RoleBadge } from "./RoleBadge"

export async function AppHeader({ period }: { period?: string }) {
  const user = await getSessionUser()
  const periods = await listPeriods()
  const active = await resolvePeriodId(period)
  return (
    <header className="flex items-center justify-between border-b border-mfa-track px-8 py-4">
      <Link href="/" className="font-serif text-xl font-light text-mfa-red">Munro FA</Link>
      <div className="flex items-center gap-4">
        <PeriodSelector periods={periods} value={active} />
        <span className="font-semibold">{user.name}</span>
        <RoleBadge role={user.role} />
      </div>
    </header>
  )
}
```

Restructure: create `src/app/(app)/layout.tsx`:

```tsx
import { AppHeader } from "@/components/AppHeader"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* @ts-expect-error async server component */}
      <AppHeader />
      {children}
    </>
  )
}
```

Move `src/app/page.tsx` → `src/app/(app)/page.tsx`. Keep `src/app/login/` where it is (outside the group, no header). Keep `src/app/layout.tsx` as the root (html/body/fonts).

- [ ] **Step 5: Verify**

Run: `npm run dev`; log in; confirm the header shows "Munro FA", a period `<select>` reading "Q3 2026", your name, and an `ADMIN` badge. Switch nothing else yet.
Run: `npm run lint && npm run typecheck`
Expected: clean (the `@ts-expect-error` on the async component is intentional for Next 14).

- [ ] **Step 6: Commit**

```bash
git add munro-oma
git commit -m "feat: add AppHeader, breadcrumbs, role badge, period selector"
```

---

## Task 8: Data helpers (`queries.ts`) + integration test

**Files:**
- Create: `src/lib/queries.ts`
- Test: `tests/queries.integration.test.ts`

**Interfaces:**
- Consumes: `db`, `progress.ts` (`omaProgress`, `personProgress`, `buProgress`, `mean`).
- Produces:
  - `getCompanyDashboard(periodId: string): Promise<{ id: string; name: string; pct: number }[]>` — one row per BU that has ≥1 OMA in the period, ordered by `BusinessUnit.order`.
  - `getBusinessUnit(buId: string, periodId: string): Promise<{ name: string; people: { id: string; name: string; pct: number }[] } | null>` — active users in the BU, ordered by name. `pct` per person from their OMAs in the period.
  - `getPerson(userId: string, periodId: string): Promise<{ id: string; name: string; businessUnit: { id: string; name: string } | null; omas: { id: string; sequence: number; pct: number }[] } | null>` — omas ordered by `sequence`.
  - `getOma(omaId: string): Promise<OmaDetail | null>` where
    `OmaDetail = { id; sequence; outcome; createdAt: Date; owner: { id; name; managerId: string | null; businessUnit: { id; name } | null }; period: { id; label; startDate: Date }; metrics: { id; measure; target; order }[]; actions: { id; description; dueDate: Date | null; completed: boolean; order }[]; pct: number }` — metrics and actions ordered by `order`.

- [ ] **Step 1: Write `src/lib/queries.ts`**

```ts
import { db } from "@/lib/db"
import { buProgress, omaProgress, personProgress } from "@/lib/progress"

export async function getCompanyDashboard(periodId: string) {
  const bus = await db.businessUnit.findMany({
    orderBy: { order: "asc" },
    include: {
      users: {
        where: { active: true },
        include: { omas: { where: { periodId }, include: { actions: { select: { completed: true } } } } },
      },
    },
  })
  return bus
    .map((bu) => ({
      id: bu.id,
      name: bu.name,
      hasOmas: bu.users.some((u) => u.omas.length > 0),
      pct: buProgress(bu.users.map((u) => ({ omas: u.omas }))),
    }))
    .filter((b) => b.hasOmas)
    .map(({ id, name, pct }) => ({ id, name, pct }))
}

export async function getBusinessUnit(buId: string, periodId: string) {
  const bu = await db.businessUnit.findUnique({
    where: { id: buId },
    include: {
      users: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: { omas: { where: { periodId }, include: { actions: { select: { completed: true } } } } },
      },
    },
  })
  if (!bu) return null
  return {
    name: bu.name,
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
        include: { actions: { select: { completed: true } } },
      },
    },
  })
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    businessUnit: user.businessUnit,
    omas: user.omas.map((o) => ({ id: o.id, sequence: o.sequence, pct: omaProgress(o) })),
  }
}

export async function getOma(omaId: string) {
  const oma = await db.oMA.findUnique({
    where: { id: omaId },
    include: {
      owner: {
        select: { id: true, name: true, managerId: true, businessUnit: { select: { id: true, name: true } } },
      },
      period: { select: { id: true, label: true, startDate: true } },
      metrics: { orderBy: { order: "asc" } },
      actions: { orderBy: { order: "asc" } },
    },
  })
  if (!oma) return null
  return { ...oma, pct: omaProgress(oma) }
}
```

- [ ] **Step 2: Write the integration test**

Create `tests/queries.integration.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { db } from "@/lib/db"
import { getBusinessUnit, getCompanyDashboard, getPerson } from "@/lib/queries"

let periodId: string
let sharineId: string
let marketingId: string

beforeAll(async () => {
  execSync("npm run db:seed", { stdio: "inherit" })
  const period = await db.period.findFirstOrThrow({ where: { isActive: true } })
  periodId = period.id
  const sharine = await db.user.findUniqueOrThrow({ where: { email: "sharine@munrofa.com" } })
  sharineId = sharine.id
  const mk = await db.businessUnit.findUniqueOrThrow({ where: { name: "Marketing" } })
  marketingId = mk.id
})

describe("getPerson", () => {
  it("returns Sharine's three OMAs at 100 / 45 / 0", async () => {
    const p = await getPerson(sharineId, periodId)
    expect(p?.omas.map((o) => o.pct)).toEqual([100, 45, 0])
  })
})

describe("getBusinessUnit", () => {
  it("lists Marketing people with Sharine ~48", async () => {
    const bu = await getBusinessUnit(marketingId, periodId)
    const sharine = bu?.people.find((x) => x.name === "Sharine")
    expect(sharine?.pct).toBe(48)
  })
})

describe("getCompanyDashboard", () => {
  it("returns BUs in order, all with OMAs", async () => {
    const rows = await getCompanyDashboard(periodId)
    expect(rows[0].name).toBe("Marketing")
    expect(rows.every((r) => typeof r.pct === "number")).toBe(true)
  })
})
```

- [ ] **Step 3: Run the integration test**

Run: `npm run test -- tests/queries.integration.test.ts`
Expected: PASS. (Requires a working `.env`; it reseeds the DB.)

- [ ] **Step 4: Full test + checks**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add munro-oma
git commit -m "feat: add data helpers for the read path with integration test"
```

---

## Task 9: Screens 1–3 — dashboard, business unit, person

**Files:**
- Modify: `src/app/(app)/page.tsx` (Screen 1)
- Create: `src/app/(app)/bu/[buId]/page.tsx` (Screen 2)
- Create: `src/app/(app)/person/[userId]/page.tsx` (Screen 3)
- Modify: `src/app/(app)/layout.tsx` — pass `searchParams.period` into `<AppHeader period=...>`. Since layouts don't receive `searchParams` in Next 14, instead read the period inside each page and render `<AppHeader>` from the page, OR keep `<AppHeader>` param-less (it calls `resolvePeriodId(undefined)` → active period) and accept that the selector always shows the active period label. **Decision: `<AppHeader>` stays param-less in this build; the `?period=` value is read by each page for its data.** Update Task 7's `<AppHeader>` call site accordingly (remove the `period` prop wiring; keep the prop optional).

**Interfaces:**
- Consumes: `getCompanyDashboard`, `getBusinessUnit`, `getPerson`, `resolvePeriodId`, `getActivePeriod`, `getSessionUser`, `canCreateOMA`, `<RagBar>`, `<Breadcrumbs>`, `<PageTitle>`.
- Produces: routes `/`, `/bu/[buId]`, `/person/[userId]`. Each page reads `searchParams: { period?: string }`.

- [ ] **Step 1: Screen 1 — company dashboard**

Replace `src/app/(app)/page.tsx`:

```tsx
import { PageTitle } from "@/components/PageTitle"
import { RagBar } from "@/components/RagBar"
import { getCompanyDashboard } from "@/lib/queries"
import { getActivePeriod, resolvePeriodId } from "@/lib/periods"
import { db } from "@/lib/db"

export default async function DashboardPage({ searchParams }: { searchParams: { period?: string } }) {
  const periodId = await resolvePeriodId(searchParams.period)
  const period = await db.period.findUniqueOrThrow({ where: { id: periodId } })
  const rows = await getCompanyDashboard(periodId)
  const qp = searchParams.period ? `?period=${periodId}` : ""

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <div className="flex items-baseline justify-between">
        <PageTitle>Main dashboard</PageTitle>
        <span className="text-xs font-semibold uppercase tracking-widest text-mfa-red">
          Q{period.quarter} · All departments
        </span>
      </div>
      <div className="mt-10">
        {rows.map((bu) => (
          <RagBar key={bu.id} label={bu.name} value={bu.pct} href={`/bu/${bu.id}${qp}`} />
        ))}
      </div>
      <p className="mt-12 text-sm text-mfa-muted">
        Bars show OMAs completed against OMAs set. Click a department to open its team.
      </p>
    </main>
  )
}
```

- [ ] **Step 2: Screen 2 — business unit**

Create `src/app/(app)/bu/[buId]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { RagBar } from "@/components/RagBar"
import { getBusinessUnit } from "@/lib/queries"
import { db } from "@/lib/db"
import { resolvePeriodId } from "@/lib/periods"

export default async function BuPage({
  params,
  searchParams,
}: {
  params: { buId: string }
  searchParams: { period?: string }
}) {
  const periodId = await resolvePeriodId(searchParams.period)
  const period = await db.period.findUniqueOrThrow({ where: { id: periodId } })
  const bu = await getBusinessUnit(params.buId, periodId)
  if (!bu) notFound()
  const qp = searchParams.period ? `?period=${periodId}` : ""

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <Breadcrumbs
        items={[
          { label: "Main dashboard", href: `/${qp}` },
          { label: bu.name },
          { label: period.label },
        ]}
      />
      <div className="mt-3">
        <PageTitle>{bu.name}</PageTitle>
      </div>
      <div className="mt-10">
        {bu.people.map((p) => (
          <RagBar key={p.id} label={p.name} value={p.pct} href={`/person/${p.id}${qp}`} />
        ))}
      </div>
      <p className="mt-12 text-sm text-mfa-muted">
        Department roll-up is the average of its people. Click a name to open their OMAs.
      </p>
    </main>
  )
}
```

- [ ] **Step 3: Screen 3 — person**

Create `src/app/(app)/person/[userId]/page.tsx`:

```tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { RagBar } from "@/components/RagBar"
import { getPerson } from "@/lib/queries"
import { db } from "@/lib/db"
import { resolvePeriodId } from "@/lib/periods"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"
import { createOma } from "./actions"

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: { userId: string }
  searchParams: { period?: string }
}) {
  const periodId = await resolvePeriodId(searchParams.period)
  const period = await db.period.findUniqueOrThrow({ where: { id: periodId } })
  const person = await getPerson(params.userId, periodId)
  if (!person) notFound()
  const viewer = await getSessionUser()
  const target = await db.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { id: true, managerId: true },
  })
  const canAdd = canCreateOMA(viewer, target, person.omas.length)
  const qp = searchParams.period ? `?period=${periodId}` : ""

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <Breadcrumbs
        items={[
          ...(person.businessUnit
            ? [{ label: person.businessUnit.name, href: `/bu/${person.businessUnit.id}${qp}` }]
            : []),
          { label: person.name },
          { label: period.label },
        ]}
      />
      <div className="mt-3 flex items-baseline justify-between">
        <PageTitle>{person.name} — OMAs</PageTitle>
        {canAdd && (
          <form action={createOma.bind(null, person.id, periodId)}>
            <button className="rounded-full bg-mfa-red px-4 py-1.5 text-sm font-semibold text-white">
              New OMA
            </button>
          </form>
        )}
      </div>
      <div className="mt-10">
        {person.omas.map((o) => (
          <RagBar key={o.id} label={`OMA ${o.sequence}`} value={o.pct} href={`/oma/${o.id}${qp}`} />
        ))}
        {person.omas.length === 0 && (
          <p className="text-sm text-mfa-muted">No OMAs set for this period yet.</p>
        )}
      </div>
      <p className="mt-12 text-sm text-mfa-muted">
        Three OMAs is the cap — it keeps the review conversation short and honest.
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Stub `createOma` so this compiles (full impl in Task 11)**

Create `src/app/(app)/person/[userId]/actions.ts`:

```ts
"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canCreateOMA } from "@/lib/authz"

export async function createOma(userId: string, periodId: string) {
  const viewer = await getSessionUser()
  const target = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, managerId: true },
  })
  const count = await db.oMA.count({ where: { ownerId: userId, periodId } })
  if (!canCreateOMA(viewer, target, count)) throw new Error("Not allowed")

  const nextSeq = count + 1
  const oma = await db.oMA.create({
    data: { ownerId: userId, periodId, sequence: nextSeq, outcome: "" },
  })
  revalidatePath(`/person/${userId}`)
  redirect(`/oma/${oma.id}/edit`)
}
```

- [ ] **Step 5: Verify the click-through**

Run: `npm run dev`; log in as admin. From `/`: click Marketing → see Sharine/John/Sam bars → click Sharine → see OMA 1/2/3 at 100/45/0. Breadcrumbs present and correctly coloured. Switch the period selector — bars still render (only Q3 2026 exists, so no data change expected).
Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add munro-oma
git commit -m "feat: add read path screens 1-3 (dashboard, BU, person)"
```

---

## Task 10: Screen 4 — OMA detail + tick action

**Files:**
- Create: `src/app/(app)/oma/[omaId]/page.tsx`
- Create: `src/app/(app)/oma/[omaId]/actions.ts` (`tickAction`; `saveOma` added in Task 11)
- Create: `src/components/ActionCheckbox.tsx`

**Interfaces:**
- Consumes: `getOma`, `getSessionUser`, `canEditActions`, `canEditOma`, `<Breadcrumbs>`, `<PageTitle>`.
- Produces:
  - `src/app/(app)/oma/[omaId]/actions.ts`: `export async function tickAction(actionId: string, completed: boolean): Promise<void>` — verifies `canEditActions` on the parent OMA, sets `completed` + `completedAt`, `revalidatePath` on the OMA, person, BU and `/`.
  - `<ActionCheckbox actionId completed disabled />` — client; optimistic; calls `tickAction`.

- [ ] **Step 1: `tickAction`**

Create `src/app/(app)/oma/[omaId]/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { canEditActions } from "@/lib/authz"

export async function tickAction(actionId: string, completed: boolean): Promise<void> {
  const viewer = await getSessionUser()
  const action = await db.action.findUniqueOrThrow({
    where: { id: actionId },
    include: { oma: { select: { id: true, ownerId: true, owner: { select: { managerId: true } } } } },
  })
  if (!canEditActions(viewer, { ownerId: action.oma.ownerId, owner: action.oma.owner })) {
    throw new Error("Not allowed")
  }
  await db.action.update({
    where: { id: actionId },
    data: { completed, completedAt: completed ? new Date() : null },
  })
  revalidatePath(`/oma/${action.oma.id}`)
  revalidatePath(`/person/${action.oma.ownerId}`)
  revalidatePath("/")
}
```

- [ ] **Step 2: `<ActionCheckbox>`**

Create `src/components/ActionCheckbox.tsx`:

```tsx
"use client"

import { useTransition } from "react"
import { tickAction } from "@/app/(app)/oma/[omaId]/actions"

export function ActionCheckbox({
  actionId,
  completed,
  disabled,
}: {
  actionId: string
  completed: boolean
  disabled: boolean
}) {
  const [pending, start] = useTransition()
  return (
    <input
      type="checkbox"
      defaultChecked={completed}
      disabled={disabled || pending}
      onChange={(e) => start(() => tickAction(actionId, e.target.checked))}
      className="h-4 w-4 accent-mfa-red"
    />
  )
}
```

- [ ] **Step 3: Screen 4 page**

Create `src/app/(app)/oma/[omaId]/page.tsx`:

```tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { ActionCheckbox } from "@/components/ActionCheckbox"
import { getOma } from "@/lib/queries"
import { getSessionUser } from "@/lib/session"
import { canEditActions, canEditOma } from "@/lib/authz"

export default async function OmaDetailPage({
  params,
  searchParams,
}: {
  params: { omaId: string }
  searchParams: { period?: string }
}) {
  const oma = await getOma(params.omaId)
  if (!oma) notFound()
  const viewer = await getSessionUser()
  const authShape = { ownerId: oma.owner.id, owner: { managerId: oma.owner.managerId } }
  const canTick = canEditActions(viewer, authShape)
  const showEdit = canEditOma(viewer, authShape)
  const qp = searchParams.period ? `?period=${searchParams.period}` : ""

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <Breadcrumbs
        items={[
          ...(oma.owner.businessUnit
            ? [{ label: oma.owner.businessUnit.name, href: `/bu/${oma.owner.businessUnit.id}${qp}` }]
            : []),
          { label: oma.owner.name, href: `/person/${oma.owner.id}${qp}` },
          { label: `OMA ${oma.sequence}` },
          { label: oma.period.label },
        ]}
      />
      <div className="mt-3">
        <PageTitle>OMA {oma.sequence} — detail</PageTitle>
      </div>

      <div className="mt-10 grid grid-cols-[8rem_1fr] gap-x-8 gap-y-8">
        <span className="font-semibold">Outcome</span>
        <p className="rounded-xl bg-mfa-panel px-5 py-4">{oma.outcome || <em className="text-mfa-muted">Not set yet.</em>}</p>

        <span className="font-semibold">Metric</span>
        <div className="space-y-2">
          {oma.metrics.map((m) => (
            <div key={m.id} className="grid grid-cols-2 overflow-hidden rounded-xl bg-mfa-panel">
              <div className="px-5 py-3"><span className="font-semibold">KPI:</span> {m.measure}</div>
              <div className="border-l border-mfa-track px-5 py-3"><span className="font-semibold">Target:</span> {m.target}</div>
            </div>
          ))}
          {oma.metrics.length === 0 && <p className="text-sm text-mfa-muted">No metric set yet.</p>}
        </div>

        <span className="font-semibold">Actions</span>
        <ol className="space-y-2">
          {oma.actions.map((a, i) => (
            <li key={a.id} className="flex items-center gap-4 rounded-xl bg-mfa-panel px-5 py-3">
              <span className="font-semibold text-mfa-red">{i + 1}</span>
              {(canTick || a.completed) && (
                <ActionCheckbox actionId={a.id} completed={a.completed} disabled={!canTick} />
              )}
              <span className={a.completed ? "line-through text-mfa-muted" : ""}>{a.description}</span>
            </li>
          ))}
          {oma.actions.length === 0 && <p className="text-sm text-mfa-muted">No actions yet.</p>}
        </ol>
      </div>

      {showEdit && (
        <div className="mt-12 flex justify-end">
          <Link href={`/oma/${oma.id}/edit${qp}`}
            className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white">
            Edit
          </Link>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Verify tick behaviour**

Run: `npm run dev`.
- As `admin`: open Sharine OMA 2, tick one more action → bar on `/person/<sharine>` and `/` updates on navigation back.
- As `sharine@munrofa.com` (USER): open her OMA 1 → checkboxes enabled. Open the `Marketing Lead` for another BU's OMA (navigate via `/`) → checkboxes disabled, no Edit button.
- As `manager@munrofa.com`: Sharine's OMA shows Edit; a non-Marketing person's OMA does not.
Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add munro-oma
git commit -m "feat: add OMA detail screen with permission-aware action ticking"
```

---

## Task 11: Screen 5 — OMA edit form + save/create actions + 3-OMA cap

**Files:**
- Create: `src/app/(app)/oma/[omaId]/edit/page.tsx`
- Create: `src/components/OmaEditForm.tsx`
- Modify: `src/app/(app)/oma/[omaId]/actions.ts` — add `saveOma`
- Modify: `src/app/(app)/person/[userId]/actions.ts` — already complete from Task 9 Step 4; verify the cap path

**Interfaces:**
- Consumes: `getOma`, `getSessionUser`, `canEditOutcomeMetric`, `canEditActions`, `canEditOma`.
- Produces:
  - `saveOma(input: SaveOmaInput): Promise<void>` where
    `SaveOmaInput = { omaId: string; outcome: string; metrics: { measure: string; target: string }[]; actions: { id?: string; description: string; dueDate: string | null; completed: boolean }[] }`.
    Behaviour: load OMA + owner; compute `canEditOutcomeMetric` / `canEditActions`; if the caller may **not** edit outcome/metric, ignore `outcome` and `metrics` from the payload (keep stored values); always apply the `actions` diff when `canEditActions`, else 403. Replace metrics wholesale (delete + recreate with `order` = index) only when permitted. For actions: update existing by `id`, create those without `id`, delete stored actions whose `id` is absent from the payload; set `order` = index. `revalidatePath` OMA/person/`/`. `redirect` to `/oma/{omaId}`.
  - `<OmaEditForm oma={OmaDetail} canOutcomeMetric={boolean} canActions={boolean} />` — client; local state for rows; renders Outcome textarea + Metric rows (disabled when `!canOutcomeMetric`) + Action rows with add/remove (disabled when `!canActions`); Save calls `saveOma`.

- [ ] **Step 1: Add `saveOma` to the OMA actions file**

Append to `src/app/(app)/oma/[omaId]/actions.ts`:

```ts
import { redirect } from "next/navigation"
import { canEditActions as _canActions, canEditOutcomeMetric } from "@/lib/authz"

export type SaveOmaInput = {
  omaId: string
  outcome: string
  metrics: { measure: string; target: string }[]
  actions: { id?: string; description: string; dueDate: string | null; completed: boolean }[]
}

export async function saveOma(input: SaveOmaInput): Promise<void> {
  const viewer = await getSessionUser()
  const oma = await db.oMA.findUniqueOrThrow({
    where: { id: input.omaId },
    include: { owner: { select: { id: true, managerId: true } }, actions: { select: { id: true } } },
  })
  const authShape = { ownerId: oma.owner.id, owner: { managerId: oma.owner.managerId } }
  const mayOutcome = canEditOutcomeMetric(viewer, authShape)
  const mayActions = _canActions(viewer, authShape)
  if (!mayOutcome && !mayActions) throw new Error("Not allowed")

  await db.$transaction(async (tx) => {
    if (mayOutcome) {
      await tx.oMA.update({ where: { id: oma.id }, data: { outcome: input.outcome } })
      await tx.metric.deleteMany({ where: { omaId: oma.id } })
      if (input.metrics.length > 0) {
        await tx.metric.createMany({
          data: input.metrics
            .filter((m) => m.measure.trim() || m.target.trim())
            .map((m, i) => ({ omaId: oma.id, measure: m.measure, target: m.target, order: i })),
        })
      }
    }
    if (mayActions) {
      const keepIds = new Set(input.actions.filter((a) => a.id).map((a) => a.id as string))
      const toDelete = oma.actions.filter((a) => !keepIds.has(a.id)).map((a) => a.id)
      if (toDelete.length) await tx.action.deleteMany({ where: { id: { in: toDelete } } })
      for (let i = 0; i < input.actions.length; i++) {
        const a = input.actions[i]
        const due = a.dueDate ? new Date(a.dueDate) : null
        if (a.id) {
          await tx.action.update({
            where: { id: a.id },
            data: {
              description: a.description,
              dueDate: due,
              completed: a.completed,
              completedAt: a.completed ? new Date() : null,
              order: i,
            },
          })
        } else if (a.description.trim()) {
          await tx.action.create({
            data: {
              omaId: oma.id,
              description: a.description,
              dueDate: due,
              completed: a.completed,
              completedAt: a.completed ? new Date() : null,
              order: i,
            },
          })
        }
      }
    }
  })

  revalidatePath(`/oma/${oma.id}`)
  revalidatePath(`/person/${oma.owner.id}`)
  revalidatePath("/")
  redirect(`/oma/${oma.id}`)
}
```

(Consolidate the duplicate `redirect` import at the top of the file — there must be exactly one `import { redirect } from "next/navigation"` and one `import { revalidatePath } from "next/cache"`.)

- [ ] **Step 2: `<OmaEditForm>`**

Create `src/components/OmaEditForm.tsx`:

```tsx
"use client"

import { useState, useTransition } from "react"
import { saveOma, type SaveOmaInput } from "@/app/(app)/oma/[omaId]/actions"

type Oma = {
  id: string
  sequence: number
  outcome: string
  period: { label: string; startDate: string }
  metrics: { measure: string; target: string }[]
  actions: { id: string; description: string; dueDate: string | null; completed: boolean }[]
}

export function OmaEditForm({
  oma,
  canOutcomeMetric,
  canActions,
}: {
  oma: Oma
  canOutcomeMetric: boolean
  canActions: boolean
}) {
  const [outcome, setOutcome] = useState(oma.outcome)
  const [metrics, setMetrics] = useState(oma.metrics.length ? oma.metrics : [{ measure: "", target: "" }])
  const [actions, setActions] = useState<SaveOmaInput["actions"]>(oma.actions)
  const [pending, start] = useTransition()

  function submit() {
    start(() => saveOma({ omaId: oma.id, outcome, metrics, actions }))
  }

  const cell = "w-full bg-transparent px-3 py-2 outline-none disabled:text-mfa-muted"

  return (
    <div className="rounded-2xl border-2 border-mfa-red">
      <div className="rounded-t-2xl bg-mfa-red px-5 py-3 text-white">
        <span className="font-serif text-lg">OMA {oma.sequence}</span>
        <span className="ml-4 text-sm">Period {oma.period.label}</span>
        <span className="ml-4 text-sm">Date {new Date(oma.period.startDate).toLocaleDateString("en-GB")}</span>
      </div>

      <section className="border-b border-mfa-track">
        <div className="bg-mfa-panel px-5 py-2 text-sm font-semibold text-mfa-red">
          OUTCOME <span className="text-mfa-muted">— the result you're aiming for</span>
        </div>
        <textarea
          value={outcome}
          disabled={!canOutcomeMetric}
          onChange={(e) => setOutcome(e.target.value)}
          rows={2}
          className={cell}
        />
      </section>

      <section className="border-b border-mfa-track">
        <div className="bg-mfa-panel px-5 py-2 text-sm font-semibold text-mfa-red">
          METRIC / KPI <span className="text-mfa-muted">— how you'll know you're getting there</span>
        </div>
        {metrics.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_16rem] border-t border-mfa-track first:border-t-0">
            <input
              value={m.measure}
              disabled={!canOutcomeMetric}
              placeholder="Metric — what you measure"
              onChange={(e) => setMetrics(metrics.map((x, j) => (j === i ? { ...x, measure: e.target.value } : x)))}
              className={cell}
            />
            <input
              value={m.target}
              disabled={!canOutcomeMetric}
              placeholder="Target"
              onChange={(e) => setMetrics(metrics.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
              className={`${cell} border-l border-mfa-track`}
            />
          </div>
        ))}
        {canOutcomeMetric && (
          <div className="flex gap-4 px-3 py-2 text-sm">
            <button type="button" onClick={() => setMetrics([...metrics, { measure: "", target: "" }])} className="text-mfa-red">
              + Add metric
            </button>
            {metrics.length > 1 && (
              <button type="button" onClick={() => setMetrics(metrics.slice(0, -1))} className="text-mfa-muted">
                Remove last
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="bg-mfa-panel px-5 py-2 text-sm font-semibold text-mfa-red">
          ACTIONS <span className="text-mfa-muted">— the moves that drive the result</span>
        </div>
        {actions.map((a, i) => (
          <div key={a.id ?? `new-${i}`} className="grid grid-cols-[auto_1fr_10rem_auto] items-center gap-2 border-t border-mfa-track px-3 first:border-t-0">
            <input
              type="checkbox"
              checked={a.completed}
              disabled={!canActions}
              onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, completed: e.target.checked } : x)))}
              className="h-4 w-4 accent-mfa-red"
            />
            <input
              value={a.description}
              disabled={!canActions}
              placeholder="Action — what you'll do"
              onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
              className={cell}
            />
            <input
              type="date"
              value={a.dueDate ?? ""}
              disabled={!canActions}
              onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null } : x)))}
              className={cell}
            />
            {canActions && (
              <button type="button" onClick={() => setActions(actions.filter((_, j) => j !== i))} className="px-2 text-mfa-muted">
                ✕
              </button>
            )}
          </div>
        ))}
        {canActions && (
          <button
            type="button"
            onClick={() => setActions([...actions, { description: "", dueDate: null, completed: false }])}
            className="px-3 py-2 text-sm text-mfa-red"
          >
            + Add action
          </button>
        )}
      </section>

      <div className="flex justify-end p-4">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-mfa-red px-6 py-2 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Screen 5 page**

Create `src/app/(app)/oma/[omaId]/edit/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { PageTitle } from "@/components/PageTitle"
import { OmaEditForm } from "@/components/OmaEditForm"
import { getOma } from "@/lib/queries"
import { getSessionUser } from "@/lib/session"
import { canEditActions, canEditOutcomeMetric, canEditOma } from "@/lib/authz"

export default async function OmaEditPage({
  params,
  searchParams,
}: {
  params: { omaId: string }
  searchParams: { period?: string }
}) {
  const oma = await getOma(params.omaId)
  if (!oma) notFound()
  const viewer = await getSessionUser()
  const authShape = { ownerId: oma.owner.id, owner: { managerId: oma.owner.managerId } }
  if (!canEditOma(viewer, authShape)) redirect(`/oma/${oma.id}`)
  const qp = searchParams.period ? `?period=${searchParams.period}` : ""

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <Breadcrumbs
        items={[
          ...(oma.owner.businessUnit
            ? [{ label: oma.owner.businessUnit.name, href: `/bu/${oma.owner.businessUnit.id}${qp}` }]
            : []),
          { label: oma.owner.name, href: `/person/${oma.owner.id}${qp}` },
          { label: `OMA ${oma.sequence}`, href: `/oma/${oma.id}${qp}` },
          { label: "Edit" },
        ]}
      />
      <div className="mb-8 mt-3">
        <PageTitle>OMA {oma.sequence} — edit</PageTitle>
      </div>
      <OmaEditForm
        oma={{
          id: oma.id,
          sequence: oma.sequence,
          outcome: oma.outcome,
          period: { label: oma.period.label, startDate: oma.period.startDate.toISOString() },
          metrics: oma.metrics.map((m) => ({ measure: m.measure, target: m.target })),
          actions: oma.actions.map((a) => ({
            id: a.id,
            description: a.description,
            dueDate: a.dueDate ? a.dueDate.toISOString().slice(0, 10) : null,
            completed: a.completed,
          })),
        }}
        canOutcomeMetric={canEditOutcomeMetric(viewer, authShape)}
        canActions={canEditActions(viewer, authShape)}
      />
    </main>
  )
}
```

- [ ] **Step 4: Verify the edit path + permissions + cap**

Run: `npm run dev`.
- As `manager@munrofa.com`: open Sharine OMA 3 → Edit → set an Outcome, add a Metric, add an Action with a due date → Save → back on detail, values shown; `/person/<sharine>` bar recomputed.
- As `sharine@munrofa.com`: open her OMA 1 → Edit → Outcome + Metric inputs are `disabled`; Actions are editable; tick/untick an action → Save → detail + bars update.
- As `sharine@munrofa.com`: try `/oma/<john's oma>/edit` in the URL → redirected to the detail page.
- Cap: as `manager`, on a Marketing person who already has 3 OMAs, the "New OMA" button is absent; hitting `createOma` cannot exceed 3 (the unique constraint + count check).
Run: `npm run test && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add munro-oma
git commit -m "feat: add permission-aware OMA edit form with save and 3-OMA cap"
```

---

## Task 12: Polish pass — layout, empty states, mockup fidelity

**Files:**
- Modify: `src/app/(app)/page.tsx`, `src/app/(app)/bu/[buId]/page.tsx`, `src/app/(app)/person/[userId]/page.tsx`, `src/app/(app)/oma/[omaId]/page.tsx`, `src/components/RagBar.tsx`, `src/components/AppHeader.tsx`, `src/app/globals.css`
- Create: `src/app/(app)/not-found.tsx`

**Interfaces:**
- Consumes: everything already built. No new exports.

- [ ] **Step 1: Compare each screen to its mockup**

Open `UX/Screens/screen-1..5.png` beside the running app at the same viewport. For each of the 5 screens note deviations in: title weight/size, breadcrumb spacing, bar height and radius, row rhythm, caption colour/size, panel radius, the red card frame on Screen 5. Write the list into the commit message.

- [ ] **Step 2: Apply spacing + type corrections**

Adjust Tailwind classes only (no logic). Targets from the mockups:
- Bars: height `h-6`, fully rounded, `#D9D9D9` track; label column ~`w-44`; `%` column right-aligned `w-14`, semibold.
- Page title: `font-serif text-4xl font-light`, ~`mt-3` below breadcrumbs.
- Captions: `text-sm text-mfa-muted`, ~`mt-12` below the list.
- Content column: `max-w-4xl`, `px-8`, generous top padding (`py-16`), matching the airy mockups.
- Screen 4 panels: `rounded-xl bg-mfa-panel`; action numerals `font-semibold text-mfa-red`.

- [ ] **Step 3: Empty + not-found states**

Create `src/app/(app)/not-found.tsx`:

```tsx
import Link from "next/link"

export default function NotFound() {
  return (
    <main className="mx-auto max-w-4xl px-8 py-24 text-center">
      <p className="font-serif text-3xl font-light">Not found</p>
      <Link href="/" className="mt-4 inline-block text-mfa-red underline">Back to the dashboard</Link>
    </main>
  )
}
```

Confirm the empty-state copy already added in Tasks 9–10 renders when a person has no OMAs / an OMA has no metric or actions.

- [ ] **Step 4: Full verification**

Run: `npm run test && npm run typecheck && npm run lint && npm run build`
Expected: all succeed; `next build` reports the 6 routes.
Manual: run the full Screen 1 → 5 click-through once more as each of the three roles.

- [ ] **Step 5: Commit + push**

```bash
git add munro-oma
git commit -m "polish: match screens to mockups, add empty and not-found states"
git push
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §1 scope (Screens 1–5, no admin) | Tasks 9–11; admin explicitly excluded |
| §2 decisions (progress = actions; simple average; quarterly; manager self-OMAs) | Task 3 (roll-up), Task 5 (seed has manager with own manager) |
| §3.1 RSC reads / Server Action writes / `?period=` | Tasks 9–11; `resolvePeriodId` Task 7 |
| §3.2 Auth.js, JWT fields, middleware, rate-limit | Task 6 (rate-limit: see gap below) |
| §3.3 `authz.ts` single source of truth | Task 4; consumed in Tasks 9–11 |
| §3.4 progress helpers + data helpers | Tasks 3, 8 |
| §4 Prisma model + Supabase datasource | Task 2 |
| §5 Screen 1 | Task 9 Step 1 |
| §5 Screen 2 | Task 9 Step 2 |
| §5 Screen 3 + New OMA | Task 9 Step 3–4, Task 11 |
| §5 Screen 4 + tick | Task 10 |
| §5 Screen 5 permission-aware + cap | Task 11 |
| §6 brand tokens, fonts, components | Tasks 1, 7, 12 |
| §7 seed | Task 5 |
| §8 Vitest on progress + authz | Tasks 3, 4; integration Task 8 |
| §9 project layout | matches "File Structure" above |
| §10 build order | Tasks 1–12 in order |
| §11 setup prerequisites | Task 1 (`.env.example`, README), Task 2 Step 2 gate |

**2. Gaps found and resolved**

- **Login rate-limiting (spec §3.2).** Not worth a dependency in a prototype behind auth. Deferred: noted here as a known omission; add a simple in-memory attempt counter in `authorize()` if the user wants it. Not a task.
- **`<AppHeader period>` wiring.** Task 7 originally passed a `period` prop from the layout, but Next 14 layouts don't get `searchParams`. Resolved in Task 9 Step (Files note): `<AppHeader>` is param-less and always shows the active period; pages read `?period=` for their own data. The prop stays optional to avoid churn.
- **Manager self-OMAs (decision #5).** Seed gives `manager@munrofa.com` a `managerId` of the admin, so an admin can create the manager's OMAs — the tree supports it. No dedicated screen needed; `/person/<manager id>` already works.

**3. Type consistency**

- `OmaAuthShape` `{ ownerId, owner: { managerId } }` — defined Task 4, constructed identically in Tasks 9/10/11 as `{ ownerId: oma.owner.id, owner: { managerId: oma.owner.managerId } }`. ✔
- `getOma` return (`OmaDetail`) — `owner.id`, `owner.name`, `owner.managerId`, `owner.businessUnit`, `period.label`, `period.startDate: Date`, `metrics[]`, `actions[]`, `pct`. Consumed in Tasks 10/11 with those exact names. ✔
- `SaveOmaInput` — defined Task 11 Step 1, imported by `<OmaEditForm>` Task 11 Step 2. `actions[].dueDate: string | null` (ISO `yyyy-mm-dd`); page maps `Date → slice(0,10)`. ✔
- `tickAction(actionId, completed)` — Task 10 Step 1 signature; called by `<ActionCheckbox>` Task 10 Step 2 with the same args. ✔
- `createOma(userId, periodId)` — Task 9 Step 4; bound in Task 9 Step 3 via `createOma.bind(null, person.id, periodId)`. ✔
- `ragState` / `ragColorVar` — Task 3; used in `<RagBar>` Task 3 Step 6. ✔

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-27-munro-oma-app.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
