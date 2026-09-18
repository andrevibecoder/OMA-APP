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
