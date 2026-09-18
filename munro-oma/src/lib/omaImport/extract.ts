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
