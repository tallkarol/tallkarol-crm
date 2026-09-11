/**
 * The meeting-note spine against the real database, with a stub for the
 * model: paste → notes → file one task → the task carries the item's ref →
 * filing again is a no-op; then the recorder lifecycle on a client-less row:
 * requested → claimed → heartbeat verdicts → stop → recorded → transcription
 * claimed → transcript → review; then the 90-second guard on a stale Start.
 * Creates throwaway rows and deletes them. No client is used, so no punch is
 * ever opened — the timesheet is never touched.
 *
 *   npm run check:meeting-notes:db
 */

import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { meetingNotes, tasks, users } from "../db/schema"
import {
  claimCapture,
  claimTranscription,
  createFromTranscript,
  deleteNoteHard,
  fileItems,
  liveRecording,
  loadNote,
  markRecorded,
  recordHeartbeat,
  requestStop,
  saveTranscript,
  startRecording,
  sweepMeetingNotes,
} from "../lib/meeting-notes"
import type { Analyzer } from "../lib/meeting-note-analysis"
import { ITEM_REF_KIND, TASK_SOURCE } from "../lib/meeting-note"

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

const stubAnalyzer: Analyzer = async (input) => ({
  model: "stub",
  usage: { inputTokens: 1, outputTokens: 1 },
  analysis: {
    title: "Throwaway check-in",
    summary: `Stub notes for ${input.segments.length} segments.\n\nNothing here is real.`,
    attendees: [{ name: "Karol", role: "Karol" }],
    topics: [{ title: "The check", detail: "Runs the spine." }],
    decisions: ["Keep the check"],
    questions: [],
    items: [
      { kind: "task", title: "Throwaway task from the meeting-notes check", detail: "delete me", quote: input.segments[0]?.text ?? "", segmentIndex: 0, owner: "Karol", dueOn: null, startsAt: null, endsAt: null, confidence: "high" },
      { kind: "question", title: "Is this a throwaway?", detail: "", quote: "", segmentIndex: -1, owner: "", dueOn: null, startsAt: null, endsAt: null, confidence: "medium" },
    ],
  },
})

async function main() {
  const admin = await db.query.users.findFirst({ where: eq(users.role, "admin") })
  if (!admin) throw new Error("No admin user to run the check as.")
  const created: string[] = []
  const taskIds: string[] = []

  try {
    console.log("paste → notes → file")
    const pasted = await createFromTranscript({
      userId: admin.id,
      title: "",
      text: "[00:00] Karol: Okay, throwaway check.\n[00:04] Rebecca: Loud and clear.\n[00:10] Karol: I'll delete this row in a second.",
      analyzer: stubAnalyzer,
    })
    check("paste created", pasted.ok, true)
    if (!pasted.ok) throw new Error(pasted.error)
    created.push(pasted.data.id)
    let note = await loadNote(pasted.data.id)
    check("status review", note?.status, "review")
    check("transcript done, analysis done", [note?.transcriptStatus, note?.analysisStatus], ["done", "done"])
    check("title from the stub", note?.title, "Throwaway check-in")
    check("two proposals", note?.items.proposed, 2)
    check("segments parsed with speakers", note?.segments.map((s) => s.speaker), ["Karol", "Rebecca", "Karol"])

    const taskItem = note!.itemRows.find((i) => i.kind === "task")!
    const filed = await fileItems(admin.id, note!.id, [taskItem.id])
    check("filed one", filed.ok && filed.data.filed.length, 1)
    if (filed.ok && filed.data.filed[0].taskId) taskIds.push(filed.data.filed[0].taskId)
    const task = filed.ok && filed.data.filed[0].taskId
      ? await db.query.tasks.findFirst({ where: eq(tasks.id, filed.data.filed[0].taskId) })
      : null
    check("task carries source + ref", [task?.source, task?.refKind, task?.refId], [TASK_SOURCE, ITEM_REF_KIND, taskItem.id])
    check("task labelled", task?.labels, ["meeting note"])
    const again = await fileItems(admin.id, note!.id, [taskItem.id])
    check("filing again is a no-op", again.ok && again.data.filed.length, 0)
    note = await loadNote(note!.id)
    check("note filed once nothing filable is left", note?.status, "filed")
    check("question stays proposed (not filable)", note?.itemRows.find((i) => i.kind === "question")?.state, "proposed")

    console.log("recorder lifecycle (no client, no punch)")
    const started = await startRecording({ userId: admin.id, title: "Throwaway recording", clientRequestId: `check-${Date.now()}` })
    check("start requested", started.ok && started.data.note.status, "requested")
    if (!started.ok) throw new Error(started.error)
    const id = started.data.note.id
    created.push(id)
    const twice = await startRecording({ userId: admin.id, title: "second" })
    check("second start refused while one is live", !twice.ok && twice.status, 409)
    const live = await liveRecording(admin.id)
    check("live row is the requested one", live?.id, id)

    const job = await claimCapture("check-mac")
    check("claimed by the worker", job?.id, id)
    let beat = await recordHeartbeat({ noteId: id, worker: "check-mac", levels: { mic: 0.2, sys: 0.1 } })
    check("heartbeat continues", beat.ok && beat.data.verdict, "continue")
    const other = await recordHeartbeat({ noteId: id, worker: "other-mac" })
    check("another worker is refused", !other.ok && other.status, 409)
    const stopped = await requestStop(admin.id, id)
    check("stop requested", stopped.ok && stopped.data.status, "stopping")
    beat = await recordHeartbeat({ noteId: id, worker: "check-mac" })
    check("heartbeat says stop", beat.ok && beat.data.verdict, "stop")
    const recorded = await markRecorded({ noteId: id, worker: "check-mac", durationSec: 61, tracks: ["mic", "system"], recordingPath: "/tmp/check" })
    check("recorded", recorded.ok && !recorded.data.replayed, true)
    const replay = await markRecorded({ noteId: id, worker: "check-mac", durationSec: 61, tracks: ["mic"], recordingPath: "/tmp/check" })
    check("recorded replay is a no-op", replay.ok && replay.data.replayed, true)
    check("live is gone", await liveRecording(admin.id), null)

    const noJob = await claimTranscription("other-mac")
    check("transcription is affine — another Mac gets nothing", noJob, null)
    const tjob = await claimTranscription("check-mac")
    check("this Mac gets the transcription", tjob?.id, id)
    const saved = await saveTranscript({
      noteId: id,
      worker: "check-mac",
      segments: [
        { start: 0, end: 3, speaker: "Karol", text: "Testing the recorder path." },
        { start: 4, end: 8, speaker: "Others", text: "Sounds good." },
      ],
      model: "whisper-check",
      language: "en",
      analyzer: stubAnalyzer,
    })
    check("transcript saved → review", saved.ok && saved.data.status, "review")
    check("duration kept from the recording", saved.ok && saved.data.durationSec, 61)
    check("text twin derived", saved.ok && saved.data.segments.length, 2)

    console.log("the 90-second guard")
    const stale = await startRecording({ userId: admin.id, title: "Stale start" })
    if (!stale.ok) throw new Error(stale.error)
    created.push(stale.data.note.id)
    await db
      .update(meetingNotes)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(meetingNotes.id, stale.data.note.id))
    const swept = await sweepMeetingNotes()
    check("stale request failed by the sweep", swept.staleRequests >= 1, true)
    const failedRow = await db.query.meetingNotes.findFirst({ where: eq(meetingNotes.id, stale.data.note.id) })
    check("row is failed", failedRow?.status, "failed")
    check("claim skips nothing else", await claimCapture("check-mac"), null)
  } finally {
    for (const id of taskIds) await db.delete(tasks).where(eq(tasks.id, id))
    for (const id of created) await deleteNoteHard(id)
    const leftovers = await db.query.meetingNotes.findMany({
      where: and(eq(meetingNotes.userId, admin.id), eq(meetingNotes.title, "Throwaway recording")),
    })
    for (const row of leftovers) await deleteNoteHard(row.id)
    console.log(`\ncleaned up ${created.length} notes, ${taskIds.length} tasks`)
  }

  console.log(failures === 0 ? "\nall good" : `\n${failures} failing`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
