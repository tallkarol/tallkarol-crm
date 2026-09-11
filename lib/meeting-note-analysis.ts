import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import {
  AnalysisSchema,
  numberedTranscript,
  sanitizeAnalysis,
  type Analysis,
  type TranscriptSegment,
} from "@/lib/meeting-note"

/**
 * The transcript → notes call. Runs on the CRM, not the Mac: the same lane
 * as the notebook scan (`lib/notion-scan.ts`) — structured output against a
 * zod schema, so the shape is guaranteed and a re-run works from a phone
 * with the Mac asleep. Costs API money per meeting; the model is an env
 * switch. Throws when the model refuses or returns nothing parseable; the
 * caller falls back to `mechanicalFallback()` so a blank is never the outcome.
 */

export const ANALYSIS_MODEL = process.env.MEETING_NOTES_MODEL || "claude-opus-5"

const SYSTEM = `You write meeting notes for TALLKAROL, a solo web-development consultancy run by Karol. Each request gives you one meeting transcript as numbered segments, each tagged with who spoke and when.

Write everything in English, whatever language was spoken — meetings are held in Polish or English. The one exception is "quote": copy it verbatim in the language spoken, from a single segment, and set segmentIndex to that segment's number. When no single segment evidences an item, leave quote empty and segmentIndex -1.

title: what the meeting was about, at most 80 characters, without the client's name (it is shown beside the title already).
summary: two to four short paragraphs of plain prose separated by a blank line, at most 900 characters in total. No headings, links, tables, bullet or nested lists. Say what was discussed, what was settled, and what is still open.
attendees: the people who spoke or were named, with a role when it was said (client, Karol, developer…).
topics: up to eight, each a short title and one sentence.
decisions: what was settled on the call. questions: what was asked and left unanswered.
items: kind "task" for a commitment made, a request received, or a decision that still needs doing; kind "event" for a meeting or call whose date or time was actually agreed; kind "decision" or "question" only when it deserves its own receipt. owner is who committed — "Karol" when he did, the person's name otherwise. dueOn is YYYY-MM-DD when a day was named or clearly implied ("by Friday" counts from the meeting date, in the client's zone), otherwise null. startsAt and endsAt are wall-clock YYYY-MM-DDTHH:mm in the client's zone, or YYYY-MM-DD when only a day was agreed; null when nothing was agreed. confidence is "high" when the transcript states it plainly, "medium" when you inferred it.

Never invent a person, a date or a commitment. Fewer, higher-confidence items beat exhaustive lists; empty arrays are fine.`

export type AnalysisInput = {
  clientName: string | null
  projectName: string | null
  title: string
  /** "Tue, Sep 9, 2026 at 2:00 PM (America/New_York)" — dates resolve against this. */
  moment: string
  /** YYYY-MM-DD of the meeting in the client's zone. */
  day: string
  timeZone: string
  attendees: string[]
  segments: TranscriptSegment[]
  speakerNames: Record<string, string>
}

export type AnalysisOutcome = {
  analysis: Analysis
  model: string
  usage: Record<string, number>
}

export function analysisPrompt(input: AnalysisInput): string {
  const lines = [
    `Client: ${input.clientName ?? "none — not tied to a client yet"}`,
    `Project: ${input.projectName ?? "none"}`,
    `Meeting: ${input.title.trim() || "(untitled)"}`,
    `When: ${input.moment}`,
    `Meeting day (for relative dates): ${input.day}`,
    `Client zone: ${input.timeZone}`,
    input.attendees.length ? `On the calendar invite: ${input.attendees.join(", ")}` : "",
    `Speakers: "Karol" is the microphone track (Karol himself); "Others" is everyone else on the call, from the system audio.${
      Object.keys(input.speakerNames).length
        ? ` Renamed for this meeting: ${Object.entries(input.speakerNames)
            .map(([k, v]) => `${k} = ${v}`)
            .join(", ")}.`
        : ""
    }`,
    "",
    "Numbered segments:",
    numberedTranscript(input.segments, input.speakerNames),
  ]
  return lines.filter((l) => l !== "").join("\n")
}

export type Analyzer = (input: AnalysisInput) => Promise<AnalysisOutcome>

export const analyzeTranscript: Analyzer = async (input) => {
  if (!input.segments.length) throw new Error("The transcript is empty.")
  const anthropic = new Anthropic()
  const response = await anthropic.messages.parse({
    model: ANALYSIS_MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: analysisPrompt(input) }],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  })

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to write these notes.")
  }
  const parsed = response.parsed_output
  if (!parsed) throw new Error("The model returned nothing parseable.")

  const usage = response.usage
  return {
    analysis: sanitizeAnalysis(parsed, input.segments.length),
    model: response.model || ANALYSIS_MODEL,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    },
  }
}
