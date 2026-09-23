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
  "≥ 90%" -> 90). A range ("10-15%" or "R35m to R39m") -> the LOWER bound. A clause
  stating no change is a real, trackable target, not narrative to discard — "Price
  largely constant (0% increase)" -> target 0, unit PERCENT, direction LOWER_BETTER.
  If the target is "[TBC]", a bare date, or pure narrative with no figure -> target
  null. Always null when unit is DATE (use "targetDate" instead). In every case,
  always copy the original clause text into "targetText" verbatim.
- "targetDate": an ISO date (YYYY-MM-DD) ONLY when unit is DATE — the deadline
  itself (e.g. "Signed off in the week of 30 September 2026" -> "2026-09-30", the
  Monday of that week). null for every other unit, including a number/percent
  target that merely has a date attached (see "unit" below).
- "unit": CURRENCY for "R…"/"ZAR"/"Rand". PERCENT only for a true percentage — a
  "%" sign, or an NPS score (which runs -100 to 100). DAYS for "days"/"turnaround".
  DATE only when the clause's whole target IS a deadline with no number/percent of
  its own — a deliverable that's simply "done" or "not done" by a date (e.g. "Signed
  off in the week 30 September 2026, ready to feed the October planning & budget
  round"). Do NOT use DATE for something like "100% by 31 December 2026" — that's
  a real PERCENT target (100) that happens to name a date; keep unit PERCENT and
  put the date in "note" instead. Otherwise NUMBER — this includes any "X out of N"
  or "X/N" score where N isn't 100 (e.g. "7/10", "a wellbeing score out of 10"):
  that's a plain number on its own scale, not a percentage, even though the source
  calls it a "score". null only if genuinely unclear.
- "direction": LOWER_BETTER for "reduce"/"turnaround"/"drop-off"/"rework"/a
  no-increase constraint; else HIGHER_BETTER. null only if genuinely unclear.
- "note": null when the target/unit/direction above were unambiguous. Otherwise a
  short, one-sentence, human-readable explanation of what happened, so it can be
  shown right under this KPI once it's saved — e.g. a range was collapsed to its
  lower bound ("Target expressed as banded ranges (redesign <90% · focus 90–95% ·
  grow 95–98% · multiply >98%); collapsed to the lower bound of the 'focus' band
  (90)."), a value was marked TBC/provisional in the source, the target is missing
  entirely ("Target is null — stated as '...' with no figure."), or unit/direction
  had to be guessed. This travels with the KPI, not the document, so write it as a
  standalone sentence naming the KPI's own measure only when that adds clarity.

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
- "warnings": document- and action-level issues only — a missing/unreadable subject
  name or period line, an action with no dueDate and a vague status. Per-KPI target
  issues go on that KPI's own "note" field instead, not here.`

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
