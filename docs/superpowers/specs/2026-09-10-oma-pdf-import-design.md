# Munro FA — OMA PDF Import (AI-assisted) · Design Spec

Status: **draft for review** · 10 Sept 2026
Follows on from `2026-08-27-munro-oma-app-design.md` (the OMA app, live).

---

## 1. Scope of this build

A staff member completes their OMAs in a Word document, exported to PDF. This build
lets someone **upload that PDF and have Claude draft the OMAs into the app**, then
review and create them — instead of retyping.

**In scope**

- `/import` route: upload a PDF, pick the subject.
- One Anthropic API call that returns a structured draft (N OMAs + a period hint +
  per-field warnings).
- An import-review page: every drafted OMA shown as editable fields with the AI's
  values filled in and uncertain bits flagged; fix, pick subject + period, "Create".
- `createImportedOmas` — validates each OMA against the existing save rules and
  creates them at the next free sequence numbers, in one transaction.
- Pure, unit-tested normalisation (`toDraft`, `createFromDraft`).

**Out of scope**

- OCR / scanned or photographed PDFs (a warning says the parse may be poor).
- Storing the PDF or an import history / audit record (transient — nothing persisted
  until "Create").
- Overwriting or merging with existing OMAs (imported OMAs are always appended).
- Any change to OMA editing, the review module, or the data model.
- Bulk import (one person per upload).

---

## 2. Decisions — resolved in brainstorming

| # | Decision | Choice |
|---|----------|--------|
| D1 | Parse method | **Send the PDF straight to Claude** (base64 `document` block). No PDF-text library — table layout (Metric/Target, Action/Status) is preserved. |
| D2 | Data egress | The org accepts OMA content going to the Anthropic API for parsing (owner-approved 2026-09-10). Anthropic does not train on API traffic; ~30-day retention for abuse monitoring only. |
| D3 | Who can import | Admin (anyone), Manager (self + direct reports), User (self only) — exactly `canCreateOMA`. |
| D4 | PDF source | Always Word → PDF exports (text-based). OCR out of scope. |
| D5 | Template | Roughly consistent (the Munro OMA template). The AI tolerates variation; the review step catches the rest. |
| D6 | OMAs per PDF | One OMA per OUTCOME section, no cap (4+ is fine). |
| D7 | Period | The importer picks; pre-selected to the existing period whose date range **best overlaps** the PDF's "Period" line. |
| D8 | Review step | **One import-review page** — all drafted OMAs, editable, then "Create all". |
| D9 | Persistence | **Transient.** No PDF stored, no import record, no schema change. |
| D10 | Existing OMAs | **Append.** Imported OMAs take the next sequence numbers after any the person already has for that period; nothing existing is touched. |
| D11 | Model | Default `claude-opus-5` (per the claude-api skill). A one-line constant — the owner may switch to `claude-sonnet-5` / `claude-haiku-4-5` to cut cost; this is a consistent-template extraction and a strong candidate for it. |

---

## 3. Architecture

```
src/
  lib/omaImport/
    schema.ts           the JSON schema Claude fills + the derived TS types
    extract.ts          extractFromPdf(pdfBase64, filename) -> ExtractedImport
                        (the ONLY Anthropic call; throws ImportNotConfiguredError if no key)
    toDraft.ts          pure: (ExtractedImport, Period[]) -> ImportDraft
    createFromDraft.ts  pure: (draft OMA) -> { blockers: string[] } and the create payload shape
  app/(app)/import/
    page.tsx            upload form; renders <ImportReview> once a draft exists
    actions.ts          "use server":
                          parsePdf(formData)                 -> ImportDraft (in-memory, returned)
                          createImportedOmas(subjectId, periodId, omas) -> redirect(/person/id)
  components/
    ImportReview.tsx     "use client": the N-OMA editable review + subject/period pickers + Create
```

### 3.1 Isolation

`src/lib/omaImport/` sits beside `omaValidation.ts` / `omaCopy.ts` — it is an OMA-module
feature, not a sealed module. It **does not import** the existing OMA action files;
`createImportedOmas` calls `omaSaveBlockers` (shared validation) and Prisma directly,
mirroring `createOma` / `saveOma`. No existing OMA file, admin file, or review-module
file changes.

Shared touch-points, total:

- `package.json` — `+ @anthropic-ai/sdk`
- `.env` / `.env.example` — `+ ANTHROPIC_API_KEY`
- `src/components/AppHeader.tsx` — one "Import" nav link *(entry-point placement is an
  open decision — see §12)*

### 3.2 Rendering & data flow

- `/import` is one route. Server Component renders the upload form. `parsePdf` (Server
  Action) returns the `ImportDraft` to the client; `<ImportReview>` holds it in React
  state. Nothing is written until `createImportedOmas`.
- `parsePdf` reads the uploaded file from `FormData`, rejects non-`application/pdf` and
  `> 10 MB` before any API call, base64-encodes it, calls `extractFromPdf`, runs
  `toDraft`, returns the result.
- `createImportedOmas` is the trust boundary: session + `canCreateOMA` + server-side
  `omaSaveBlockers` on every OMA before a single write.

---

## 4. The extraction contract

### 4.1 What Claude returns (`schema.ts`)

One `client.messages.create` call: a `document` content block (base64 PDF) + a text
instruction, with `output_config: { format: { type: "json_schema", schema: … } }`
constraining the response to:

```ts
type ExtractedImport = {
  subjectName: string | null          // "Sharine Potgieter" — a hint; the importer confirms
  periodStart: string | null          // ISO date parsed from the "Period" line, e.g. "2026-09-01"
  periodEnd: string | null            // ISO date, e.g. "2027-02-28"
  omas: ExtractedOma[]
  warnings: string[]
}

type ExtractedOma = {
  title: string                       // short name, e.g. "Leads Funnel & Production Growth"
  outcome: string                     // the outcome paragraph, verbatim
  kpis: {
    measure: string
    unit: "NUMBER" | "CURRENCY" | "PERCENT" | "DAYS" | null
    direction: "HIGHER_BETTER" | "LOWER_BETTER" | null
    target: number | null             // 3_000_000 from "R3 million"; null from "[TBC]"
    targetText: string                // the original target prose — always kept
  }[]
  actions: {
    description: string
    dueDate: string | null            // ISO if a real date is present; else null
    completed: boolean
    statusText: string                // "Complete (Munro) / In progress (Inani)" — verbatim
  }[]
}
```

### 4.2 Prompt rules (baked into the instruction)

- One `ExtractedOma` per OUTCOME section (numbered or not). No cap.
- `outcome` is the outcome paragraph **verbatim** — do not summarise.
- `title` is a short label derived from the outcome heading (strip "OUTCOME n — ").
- `target`: only a number you can defend from the text (R3 million → 3000000,
  "≥ 90%" → 90). A **range** ("10 – 15%") → the **lower bound** (10) and a `warnings`
  entry. If the target is "[TBC]", a date, or pure narrative with no figure → `null`.
  In every case **always** copy the original into `targetText`.
- `unit`: CURRENCY for "R…"/"ZAR"/"Rand"; PERCENT for "%"/"NPS"/"score"; DAYS for
  "days"/"turnaround"; else NUMBER. `null` if genuinely unclear.
- `direction`: LOWER_BETTER for "reduce"/"turnaround"/"drop-off"/"rework"; else
  HIGHER_BETTER; `null` if unclear.
- `completed: true` **only** on an unambiguous "Complete"/"Done"/"Achieved". "Ongoing",
  "In progress", "TBC", "To implement" → `false`.
- `dueDate`: ISO only when a real calendar date is present ("Feb 2027" → `2027-02-01`);
  "Ongoing"/"TBC" → `null`. The phrase always goes in `statusText`.
- `warnings`: one entry per `null` target, per action with no `dueDate` and a vague
  status, and per KPI where `unit`/`direction` had to be guessed.

### 4.3 `extract.ts`

```ts
export class ImportNotConfiguredError extends Error {}

// Throws ImportNotConfiguredError when ANTHROPIC_API_KEY is unset.
// Uses the model in IMPORT_MODEL (a module constant, default "claude-opus-5").
export async function extractFromPdf(
  pdfBase64: string,
  filename: string,
): Promise<ExtractedImport>
```

One call, non-streaming, `max_tokens` ~8000. The SDK client is created lazily inside
the function so a missing key is a caught error, not a module-load crash.

---

## 5. Normalisation — `toDraft.ts` (pure)

```ts
type ImportDraft = {
  subjectName: string | null
  periodId: string | null             // best-overlap match, or null
  filename: string
  warnings: string[]
  omas: DraftOma[]
}

// DraftOma mirrors the OMA edit form's field shape (title, outcome, metrics[], actions[])
// PLUS it keeps each KPI's `targetText` and each action's `statusText` so the review
// page can show the original prose beneath a blank/guessed field.

export function toDraft(x: ExtractedImport, periods: PeriodLite[]): ImportDraft
```

- **Period match:** for each period, compute the overlap in days between
  `[periodStart, periodEnd]` and `[period.startDate, period.endDate]`; pick the largest
  positive overlap. No overlap anywhere → `periodId: null` + a warning. (Sharine's
  "1 Sep 2026 – 28 Feb 2027" overlaps H2 2026 by ~120 days vs H1 2027 by ~59 → H2 2026.)
- **Defaulting:** `unit ?? "NUMBER"`, `direction ?? "HIGHER_BETTER"` — so every KPI row
  renders with a concrete value; the importer changes it if wrong.
- **Warnings:** carry Claude's, add "no periods overlap the document's dates" when
  relevant, dedupe, keep order.
- Missing `periodStart`/`periodEnd` → `periodId: null` + warning "couldn't read the
  period dates — pick one".

`createFromDraft.ts` exposes `draftOmaBlockers(oma): string[]` (delegates to the
existing `omaSaveBlockers` with the draft's title/outcome/metrics) and
`buildCreatePayload(oma, seq)` returning the nested `{ outcome, title, sequence,
metrics: {...}, actions: {...} }` shape.

---

## 6. Screens

### /import — upload (Server Component + a small client form)

- Subject picker: a `<select>` of people the viewer may import for
  (`canCreateOMA`-filtered — self only for a USER, team for a MANAGER, everyone for an
  ADMIN). Defaults to the viewer themselves.
- File input (`accept="application/pdf"`).
- "Import from PDF" button → calls `parsePdf`; on success the page renders
  `<ImportReview draft={…} subjects={…} periods={…} />`.
- If `ANTHROPIC_API_KEY` is unset: the form is replaced by "AI import isn't configured
  on this environment." (surfaced from `ImportNotConfiguredError`).

### <ImportReview> (client)

- Header: "Importing {N} OMAs for **[subject ▾]**" · "**Period [▾]**" (pre-selected to
  `draft.periodId`) · caption: *"AI-drafted from `{filename}`. Check every field —
  targets and statuses especially."*
- Yellow box listing `draft.warnings` (if any).
- One card per `DraftOma`:
  - title (input), outcome (textarea)
  - KPI rows: measure / unit / direction / target — with `targetText` shown greyed
    beneath any target that is blank or was prose. Add / remove row.
  - Action rows: description / due date / completed checkbox — with `statusText` greyed
    beneath. Add / remove row.
  - a "won't save yet" hint from `draftOmaBlockers` (live, client-side).
  - "Remove this OMA" — drops the card from the import.
- Footer: **"Create {N} OMAs"** — disabled until a subject and period are chosen and
  every remaining card passes `draftOmaBlockers`. **Cancel** — discards, back to upload.

Reuses the OMA edit form's row sub-components where practical; it is its own component
because it is N-at-once and pre-save.

---

## 7. Create flow — `createImportedOmas` (Server Action)

Input: `subjectId`, `periodId`, `omas: DraftOma[]` (the reviewed, edited set).

1. `getSessionUser()`. Load the subject (`id`, `managerId`, `businessUnitId`) and the
   period (`startDate`, `endDate`, `locked`).
2. `if (!canCreateOMA(viewer, subject, period.locked)) return { error: "Not allowed" }`.
3. `if (omas.length === 0) return { error: "Nothing to import." }`.
4. For each OMA: `const b = omaSaveBlockers({ title, outcome, metrics })`; if any
   `b.length` → `return { error: "OMA ${i+1}: ${b.join(" ")}" }` — **create nothing**.
5. `const last = max(sequence) for (subjectId, periodId)`; build one
   `db.$transaction` of `db.oMA.create` calls at `last+1, last+2, …`, each with nested
   `metrics.create` / `actions.create`, `createdById: viewer.id`,
   `date: period.startDate`, `endDate: period.endDate`. Wrap in `withDbRetry`.
6. `revalidatePath("/person/${subjectId}")`; the BU page; `"/"`.
7. `redirect("/person/${subjectId}")`.

API-link metric fields (`source`/`apiUrl`/…) are never set by import — all imported
metrics are `MANUAL`.

---

## 8. Permissions

`src/app/(app)/import/page.tsx` and both actions gate on the existing
`canCreateOMA(viewer, subject, periodLocked)`:

| Viewer | May import for |
|---|---|
| ADMIN | anyone |
| MANAGER | self + anyone whose `managerId === viewer.id` |
| USER | self only |

The page `redirect("/")`s a viewer who has no one they can import for. A locked target
period blocks the create, same message as manual creation.

---

## 9. Testing

**Pure units (Vitest, no API, no DB) — the coverage that matters:**

- `toDraft`:
  - "R3 million" → `target: 3_000_000`, `unit: CURRENCY`; "≥ 90%" → `90`, `PERCENT`;
    "10 – 15%" → `10`, `PERCENT`; "[TBC]" → `null` + warning; a bare sentence → `null`.
  - `unit`/`direction` defaulting when Claude returns `null`.
  - period best-overlap: Sharine's Sep–Feb range picks H2 2026 over H1 2027; a 2028
    range with no periods → `null` + warning.
  - warnings deduped, order kept.
- `createFromDraft`:
  - `draftOmaBlockers` blocks a null-target-only KPI, a blank title, a blank outcome.
  - `buildCreatePayload` numbers sequences after existing OMAs; nested metric/action
    shape is correct; `completed`/`completedAt` consistent.

**`extract.ts`** — the Anthropic client is injected/mocked in tests: assert the request
carries a `document` block with the base64 PDF and the JSON schema; never call the real
API. `ImportNotConfiguredError` when the key is unset.

**One manual API check** (localhost, before merge): the attached
`OMA Template_Marketing Manager_Sharine Potgieter_Sep2026.pdf` → 4 OMAs come out with
sane titles, verbatim outcomes, `[TBC]` targets flagged, "Ongoing" actions not marked
complete.

**Manual E2E:** upload → review → fill a `[TBC]` target → Create → land on
`/person/<id>` with 4 new OMAs appended → existing OMAs unchanged. A USER importing for
someone else → page redirects. A locked period → create blocked.

**Regression:** the full existing suite stays green.

---

## 10. Project layout (after this build)

```
src/
  lib/omaImport/
    schema.ts  extract.ts  toDraft.ts  createFromDraft.ts
  app/(app)/import/
    page.tsx  actions.ts
  components/ImportReview.tsx
tests/omaImport/
  toDraft.test.ts  createFromDraft.test.ts  extract.test.ts
package.json          # + @anthropic-ai/sdk
.env / .env.example   # + ANTHROPIC_API_KEY
src/components/AppHeader.tsx   # + "Import" link
```

Existing OMA / admin / review files: unchanged.

---

## 11. Build order (for the implementation plan)

1. **`schema.ts` + types** — the JSON schema and `ExtractedImport` / `ImportDraft` /
   `DraftOma` types. No behaviour.
2. **`toDraft.ts` (TDD)** — target-prose mapping, defaulting, period overlap, warnings.
3. **`createFromDraft.ts` (TDD)** — `draftOmaBlockers`, `buildCreatePayload`, sequencing.
4. **`extract.ts`** — the Anthropic call, lazy client, `ImportNotConfiguredError`;
   test with a mocked client.
5. **`actions.ts`** — `parsePdf` (file guards + extract + toDraft), `createImportedOmas`
   (auth + `omaSaveBlockers` + transaction + redirect).
6. **`/import/page.tsx` + `ImportReview.tsx`** — upload form, the N-OMA review, Create.
7. **Nav link** + `.env.example` + `@anthropic-ai/sdk` in `package.json`.
8. **Manual API check** with the Sharine PDF, then **manual E2E**, then merge.

---

## 12. Prerequisites from the user

- **`ANTHROPIC_API_KEY`** — a key with Messages API access, in `munro-oma/.env` for
  local testing and Vercel's env for production. (Confirm whether an existing Anthropic
  account/key is available or a new one is needed.)
- **Model choice** — accept the `claude-opus-5` default (~$0.03–0.08 per import), or
  name `claude-sonnet-5` / `claude-haiku-4-5` to cut cost.
- **Import entry point** — a link in the top nav, or a button on the person page and
  dashboard (or both). Decide at spec review.
