import Link from "next/link"
import { Mic } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { NoteList } from "@/components/meeting-notes/NoteList"
import { PasteTranscript } from "@/components/meeting-notes/PasteTranscript"
import { RecorderPill } from "@/components/meeting-notes/RecorderPill"
import { getSessionUser } from "@/lib/auth"
import { listNotes, recorderStatus, targetOptions } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Meeting notes" }
export const dynamic = "force-dynamic"

export default async function MeetingNotesPage() {
  const user = await getSessionUser()
  if (!user) return null
  const [notes, recorder, options] = await Promise.all([listNotes(user.id), recorderStatus(), targetOptions()])

  return (
    <>
      <PageHeader
        title="Meeting notes"
        actions={
          <>
            <RecorderPill status={recorder} />
            <PasteTranscript clients={options.clients} projects={options.projects} />
            <Link
              href={`${ROUTES.timesheetLive}#record`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-tk-linen"
            >
              <Mic className="size-3.5" aria-hidden />
              Record
            </Link>
          </>
        }
      />
      <p className="mt-1 text-xs text-ink-3">
        Recorded on the Mac, transcribed there, written up here. Nothing is filed until you say so.
      </p>

      {notes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-card px-6 py-10 text-center">
          <p className="text-sm font-semibold text-tk-onyx">No meeting notes yet</p>
          <p className="mt-1 text-sm text-ink-3">
            Start a recording from the Clock page, paste a transcript here, or run{" "}
            <code className="rounded bg-well px-1">npm run meeting:import</code> on the Mac with a Zoom file.
          </p>
        </div>
      ) : (
        <NoteList notes={notes} />
      )}
    </>
  )
}
