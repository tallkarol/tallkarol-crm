/**
 * The meeting-note maths that would fail silently: status transitions, the
 * two-track merge and the bleed filter, the transcript parsers (VTT, SRT,
 * "Name: line", plain), the analysis sanitizer, the never-blank fallback and
 * the filing inputs. No database. Run with npm run check:meeting-notes
 */

import {
  AnalysisSchema,
  bandOf,
  canTransition,
  defaultEventEnd,
  dropBleed,
  formatClock,
  hoursFromSeconds,
  itemToEventInput,
  itemToTaskInput,
  levelBars,
  mechanicalFallback,
  mergeTracks,
  numberedTranscript,
  parseLevels,
  parseSegments,
  parseTranscript,
  phaseLabel,
  phaseSteps,
  sanitizeAnalysis,
  speakerLabel,
  transcriptText,
  SPEAKER_MIC,
  SPEAKER_SYSTEM,
  type TranscriptSegment,
} from "../lib/meeting-note"

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}\n  got  ${a}\n  want ${e}`)
  }
}

console.log("transitions")
check("requested → recording", canTransition("requested", "recording"), true)
check("requested → recorded is not a thing", canTransition("requested", "recorded"), false)
check("recording → stopping", canTransition("recording", "stopping"), true)
check("recording → recorded (worker beat the stop click)", canTransition("recording", "recorded"), true)
check("stopping → recorded", canTransition("stopping", "recorded"), true)
check("recorded → review", canTransition("recorded", "review"), true)
check("review → filed", canTransition("review", "filed"), true)
check("filed → review never", canTransition("filed", "review"), false)
check("anything → discarded", ["requested", "recording", "review", "filed", "failed"].every((s) => canTransition(s as never, "discarded")), true)
check("discarded is terminal", canTransition("discarded", "failed"), false)

console.log("labels and bands")
check("recording label", phaseLabel({ status: "recording", transcriptStatus: "pending", analysisStatus: "pending" }), "Recording")
check("recorded + transcribing", phaseLabel({ status: "recorded", transcriptStatus: "running", analysisStatus: "pending" }), "Transcribing")
check("recorded + transcript done → writing notes", phaseLabel({ status: "recorded", transcriptStatus: "done", analysisStatus: "running" }), "Writing notes")
check("review with failed notes", phaseLabel({ status: "review", transcriptStatus: "done", analysisStatus: "failed" }), "Needs review · notes failed")
check("transcript failed bands under failed", bandOf({ status: "recorded", transcriptStatus: "failed", analysisStatus: "pending" }), "failed")
check("review bands under review", bandOf({ status: "review", transcriptStatus: "done", analysisStatus: "done" }), "review")
check(
  "phase steps mid-transcription",
  phaseSteps({ status: "recorded", transcriptStatus: "running", analysisStatus: "pending", source: "live" }).map((s) => s.state),
  ["done", "now", "todo", "todo", "todo"]
)
check(
  "phase steps in review with failed notes",
  phaseSteps({ status: "review", transcriptStatus: "done", analysisStatus: "failed", source: "paste" }).map((s) => s.state),
  ["done", "done", "failed", "now", "todo"]
)
check("pasted first step label", phaseSteps({ status: "review", transcriptStatus: "done", analysisStatus: "done", source: "paste" })[0].label, "Pasted")

console.log("clock and hours")
check("47:12", formatClock(2832), "47:12")
check("1:02:03", formatClock(3723), "1:02:03")
check("null clock", formatClock(null), "—")
check("47:12 bills 0.79", hoursFromSeconds(2832), 0.79)
check("23 minutes bill 0.38", hoursFromSeconds(23 * 60), 0.38)

console.log("merge and bleed")
const mic = [
  { start: 0, end: 3, text: "Okay we're recording, can you hear me fine?" },
  { start: 14.6, end: 18, text: "We need the toll filling page live before the trade show" }, // bleed
  { start: 22.4, end: 25, text: "I can rewire it by Friday" },
]
const system = [
  { start: 4, end: 8, text: "Yes, loud and clear." },
  { start: 14.5, end: 19, text: "We need the toll filling page live before the trade show, ideally the twenty-fourth." },
]
const merged = mergeTracks(mic, system)
check("mic bleed dropped, the system copy stays", merged.map((s) => s.text.slice(0, 12)), ["Okay we're r", "Yes, loud an", "We need the ", "I can rewire"])
check("ordered by time and re-indexed", merged.map((s) => s.i), [0, 1, 2, 3])
check("speakers tagged", merged.map((s) => s.speaker), [SPEAKER_MIC, SPEAKER_SYSTEM, SPEAKER_SYSTEM, SPEAKER_MIC])
check("bleed off keeps all four", mergeTracks(mic, system, { bleed: false }).length, 5)
const far: TranscriptSegment[] = [
  { i: 0, start: 0, end: 2, speaker: SPEAKER_MIC, text: "the same exact words here friend" },
  { i: 1, start: 30, end: 32, speaker: SPEAKER_SYSTEM, text: "the same exact words here friend" },
]
check("same words 30 s apart are not bleed", dropBleed(far).length, 2)

console.log("parsers")
const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:03.500
<v Karol>Okay, we're recording.

2
00:00:04.000 --> 00:00:08.000
Rebecca: Yes, loud and clear.

3
00:00:08.000 --> 00:00:09.000
Rebecca: Yes, loud and clear.
`
const parsedVtt = parseTranscript(vtt)
check("vtt format", parsedVtt.format, "vtt")
check("vtt voice tag becomes speaker", parsedVtt.segments[0].speaker, "Karol")
check("vtt Name: prefix becomes speaker", parsedVtt.segments[1].speaker, "Rebecca")
check("vtt duplicate cue collapsed", parsedVtt.segments.length, 2)
check("vtt seconds", parsedVtt.segments[1].start, 4)
check("vtt end extended by the duplicate", parsedVtt.segments[1].end, 9)

const srt = `1
00:01:02,500 --> 00:01:05,000
Hello there

2
00:01:05,000 --> 00:01:07,000
General Kenobi
`
const parsedSrt = parseTranscript(srt)
check("srt format", parsedSrt.format, "srt")
check("srt start 62.5", parsedSrt.segments[0].start, 62.5)
check("srt two segments", parsedSrt.segments.length, 2)

const speakers = `[00:00] Karol: Okay, we're recording.
[00:04] Rebecca: Yes, loud and clear.
and thanks for making the time.
[14:32] Rebecca: We need the page live.`
const parsedSpeakers = parseTranscript(speakers)
check("speakers format", parsedSpeakers.format, "speakers")
check("continuation line joins the previous segment", parsedSpeakers.segments[1].text, "Yes, loud and clear. and thanks for making the time.")
check("speakers list", parsedSpeakers.speakers, ["Karol", "Rebecca"])
check("stamp parsed", parsedSpeakers.segments[2].start, 872)

const plain = `First paragraph of notes.

Second paragraph, no speakers at all.`
const parsedPlain = parseTranscript(plain)
check("plain format", parsedPlain.format, "plain")
check("plain has no times", parsedPlain.segments.map((s) => s.start), [null, null])
check("empty input", parseTranscript("   ").segments.length, 0)

check("wire segments drop empties and clamp", parseSegments([{ start: 1, end: 2, text: " hi ", speaker: "Karol" }, { text: "" }]), [
  { i: 0, start: 1, end: 2, speaker: "Karol", text: "hi" },
])
check("wire segments reject non-array", "error" in (parseSegments("x") as object), true)

console.log("text twins")
check("transcript text", transcriptText(merged).split("\n")[1], "[00:04] Others: Yes, loud and clear.")
check("renamed speaker", speakerLabel({ Others: "Rebecca" }, "Others"), "Rebecca")
check("numbered line", numberedTranscript(merged, { Others: "Rebecca" }).split("\n")[1], "[1] (Rebecca, 00:04) Yes, loud and clear.")

console.log("analysis contract")
const raw = AnalysisSchema.parse({
  title: "  September SEO check-in  ",
  summary: "x".repeat(2000),
  attendees: [{ name: "Rebecca Goffe", role: "client" }, { name: "", role: "" }],
  topics: [{ title: "Toll filling page", detail: "d" }],
  decisions: ["Ship before the show", ""],
  questions: [],
  items: [
    { kind: "task", title: "Send the draft", detail: "", quote: "q", segmentIndex: 99, owner: "Karol", dueOn: "2026-09-11", startsAt: null, endsAt: null, confidence: "high" },
    { kind: "task", title: "send the draft", detail: "", quote: "", segmentIndex: 1, owner: "", dueOn: "tomorrow", startsAt: null, endsAt: null, confidence: "medium" },
    { kind: "event", title: "Review call", detail: "", quote: "", segmentIndex: 2, owner: "", dueOn: null, startsAt: "2026-09-16T14:00", endsAt: "2026-09-16T13:00", confidence: "high" },
    { kind: "question", title: "", detail: "", quote: "", segmentIndex: 0, owner: "", dueOn: null, startsAt: null, endsAt: null, confidence: "high" },
  ],
})
const clean = sanitizeAnalysis(raw, 3)
check("title trimmed", clean.title, "September SEO check-in")
check("summary clipped", clean.summary.length, 1400)
check("empty attendee dropped", clean.attendees.length, 1)
check("empty decision dropped", clean.decisions, ["Ship before the show"])
check("duplicate title dropped, empty title dropped", clean.items.length, 2)
check("out-of-range segment index becomes -1", clean.items[0].segmentIndex, -1)
check("end before start is dropped", clean.items[1].endsAt, null)
check("bad due date dropped on the kept twin? (first wins)", clean.items[0].dueOn, "2026-09-11")

const fallback = mechanicalFallback({ clientName: "Mineralife", dayLabel: "Tue Sep 9", segments: merged, error: "refused" })
check("fallback title", fallback.title, "Mineralife · Tue Sep 9")
check("fallback says why", fallback.summary.includes("(refused)"), true)
check("fallback with calendar title", mechanicalFallback({ calendarTitle: "SEO check-in", dayLabel: "x", segments: [] }).title, "SEO check-in")
check("fallback never blank", mechanicalFallback({ dayLabel: "x", segments: [] }).summary.length > 20, true)

console.log("filing")
const note = { title: "September SEO check-in", url: "https://crm.tallkarol.com/meeting-notes/abc", clientName: "Mineralife", dayLabel: "Tue Sep 9" }
const task = itemToTaskInput(
  { kind: "task", title: "Send the draft", detail: "Copy for the page", quote: "I'll get you the draft by Thursday", segmentStart: 891, owner: "Karol", dueOn: "2026-09-11", startsAt: "", endsAt: "", timeZone: "America/New_York" },
  note
)
check("task due kept", task.dueOn, "2026-09-11")
check("task notes carry the quote and the link", task.notes.includes("14:51") && task.notes.includes(note.url), true)
check("task label", task.labels, ["meeting note"])
const event = itemToEventInput(
  { kind: "event", title: "Review call", detail: "", quote: "", segmentStart: null, owner: "", dueOn: null, startsAt: "2026-09-16T14:00", endsAt: "", timeZone: "America/New_York" },
  note
)
check("event keeps the client zone", "timeZone" in event ? event.timeZone : "", "America/New_York")
check("event without a start is refused", "error" in itemToEventInput({ kind: "event", title: "x", detail: "", quote: "", segmentStart: null, owner: "", dueOn: null, startsAt: "", endsAt: "", timeZone: "" }, note), true)
check("event end before start is refused", "error" in itemToEventInput({ kind: "event", title: "x", detail: "", quote: "", segmentStart: null, owner: "", dueOn: null, startsAt: "2026-09-16T14:00", endsAt: "2026-09-16T13:00", timeZone: "" }, note), true)
check("default end is +30 min", defaultEventEnd("2026-09-16T14:00"), "2026-09-16T14:30")
check("default end for all-day is empty", defaultEventEnd("2026-09-16"), "")

console.log("levels")
check("levels parsed and clamped", parseLevels({ mic: 1.4, sys: 0.1 }, new Date("2026-09-10T12:00:00Z")), { at: "2026-09-10T12:00:00.000Z", mic: 1, sys: 0.1 })
check("levels without mic are nothing", parseLevels({ sys: 0.1 }), null)
check("bars", [0, 0.01, 0.05, 0.1, 0.5].map(levelBars), [0, 1, 2, 3, 4])

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`)
process.exit(failures === 0 ? 0 : 1)
