"use server"

import { revalidatePath } from "next/cache"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import {
  approveNotePunch,
  calendarNow,
  createFromTranscript,
  discardNote,
  fileItems,
  liveRecording,
  logNoteTime,
  recorderStatus,
  renameSpeaker,
  requestStop,
  requeueTranscription,
  runAnalysis,
  setItemState,
  setNoteTarget,
  setNoteTitle,
  startRecording,
  updateItem,
  type CalendarSuggestion,
  type FileOutcome,
  type ItemPatch,
  type LiveView,
  type NoteRow,
} from "@/lib/meeting-notes"
import type { WorkerStatus } from "@/lib/chat/worker-status"

/**
 * The browser's doors into meeting notes. Every action re-checks the
 * session; the db module holds the rules. Only *bound* actions may cross into
 * client components — bind the id at the call site.
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

function denied<T>(): ActionResult<T> {
  return { ok: false, error: "Your session expired — sign in again." }
}

function revalidateNotes(noteId?: string) {
  revalidatePath(ROUTES.meetingNotes)
  if (noteId) revalidatePath(ROUTES.meetingNote(noteId))
  revalidatePath(ROUTES.timesheetLive)
  revalidatePath(ROUTES.home)
}

export async function startRecordingAction(input: {
  clientId?: string | null
  projectId?: string | null
  title?: string
  clientRequestId: string
  calendarEventId?: string | null
}): Promise<ActionResult<NoteRow>> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await startRecording({ userId: user.id, ...input })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(result.data.note.id)
  return { ok: true, data: result.data.note }
}

export async function stopRecordingAction(noteId: string): Promise<ActionResult<NoteRow>> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await requestStop(user.id, noteId)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  return { ok: true, data: result.data }
}

export async function discardNoteAction(noteId: string): Promise<ActionResult<NoteRow>> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await discardNote(user.id, noteId)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  return { ok: true, data: result.data }
}

/** What the panel and the floating pill poll. */
export async function liveRecordingNow(): Promise<LiveView | null> {
  const user = await getSessionUser()
  if (!user) return null
  return liveRecording(user.id)
}

export async function recorderStatusNow(): Promise<WorkerStatus> {
  return recorderStatus()
}

export async function calendarNowAction(): Promise<CalendarSuggestion | null> {
  const user = await getSessionUser()
  if (!user) return null
  return calendarNow()
}

export async function reanalyzeAction(noteId: string): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await runAnalysis(noteId)
  revalidateNotes(noteId)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: null }
}

export async function requeueTranscriptionAction(noteId: string): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await requeueTranscription(user.id, noteId)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  return { ok: true, data: null }
}

export async function createFromTranscriptAction(input: {
  title?: string
  clientId?: string | null
  projectId?: string | null
  startedAt?: string | null
  text: string
}): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await createFromTranscript({ userId: user.id, ...input })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(result.data.id)
  return { ok: true, data: result.data }
}

export async function updateItemAction(itemId: string, patch: ItemPatch): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await updateItem(user.id, itemId, patch)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: null }
}

export async function dismissItemAction(itemId: string): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await setItemState(user.id, itemId, "dismissed")
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: null }
}

export async function restoreItemAction(itemId: string): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await setItemState(user.id, itemId, "proposed")
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: null }
}

export async function fileItemsAction(noteId: string, itemIds: string[]): Promise<ActionResult<FileOutcome>> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await fileItems(user.id, noteId, itemIds)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  revalidatePath(ROUTES.tasks)
  revalidatePath(ROUTES.calendar)
  return { ok: true, data: result.data }
}

export async function setNoteTargetAction(
  noteId: string,
  target: { clientId?: string | null; projectId?: string | null }
): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await setNoteTarget(user.id, noteId, target)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  return { ok: true, data: null }
}

export async function setNoteTitleAction(noteId: string, title: string): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await setNoteTitle(user.id, noteId, title)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  return { ok: true, data: null }
}

export async function renameSpeakerAction(noteId: string, speaker: string, name: string): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await renameSpeaker(user.id, noteId, speaker, name)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  return { ok: true, data: null }
}

export async function approveNotePunchAction(noteId: string): Promise<ActionResult<{ timeEntryId: string }>> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await approveNotePunch(user.id, noteId)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  revalidatePath(ROUTES.timesheetReview)
  revalidatePath(ROUTES.timesheetEntries)
  return { ok: true, data: result.data }
}

export async function logNoteTimeAction(noteId: string): Promise<ActionResult<{ timeEntryId: string }>> {
  const user = await getSessionUser()
  if (!user) return denied()
  const result = await logNoteTime(user.id, noteId)
  if (!result.ok) return { ok: false, error: result.error }
  revalidateNotes(noteId)
  revalidatePath(ROUTES.timesheetEntries)
  return { ok: true, data: result.data }
}
