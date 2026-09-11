# Meeting notes

A meeting is recorded on the Mac, transcribed there, and written up here: a
summary, the topics, the decisions and the open questions, and a list of
proposed tasks and calendar items that Karol files or dismisses. Started and
stopped like the clock, from the Clock page and the floating pill.

Not "meetings": that word already means calendar events proposed as time
entries (`lib/meetings.ts`, `/timesheet/review?tab=meetings`). Everything
here is a meeting **note** — `meeting_notes`, `/meeting-notes` — and the
punch a recording opens has `source = 'recorder'`, never `meeting`.

## Why the audio is on the Mac and the notes are on the CRM

Railway has no microphone, an ephemeral disk and no object storage; the CRM
cannot record and should not hold a two-hour WAV. The Mac the calls happen on
can, so a small always-on **meeting worker** (`scripts/meeting-worker.ts`,
its own launchd agent) records through a helper, runs Whisper, and posts
**text only**. The audio never leaves the machine.

The notes are written on the CRM with Anthropic structured output — the same
lane as the notebook scan (`lib/notion-scan.ts`). That is the one place in
this feature that costs API money per meeting (model `MEETING_NOTES_MODEL`,
default `claude-opus-5`), and it buys a guaranteed shape and a "Analyze again"
that works from a phone with the Mac asleep. A pasted transcript therefore
works with no Mac at all.

## Objects

| Table | Holds |
|---|---|
| `meeting_notes` | One recording or imported transcript: who and when, the capture state, the transcript (segment-level), the notes, the punch it opened. |
| `meeting_note_items` | One proposal each: `task`, `event`, `decision`, `question`, `note`; a verbatim `quote` and its `segment_index`; `state` proposed · accepted · dismissed; the `task_id` or Google event it became. |

Three status columns, all text + `canTransition()` in `lib/meeting-note.ts`:

- `status`: `requested → recording → stopping → recorded → review → filed`, plus `discarded` and `failed`.
- `transcript_status` and `analysis_status`: `pending · queued · running · done · failed`. "Transcribed but the notes failed" is `review` + `analysis_status = failed` — the transcript is shown, the page offers Analyze again.

Uniqueness: one live row per person (`requested|recording|stopping`), so a
double click cannot start twice; `client_request_id` makes a retried Start a
replay. `transcript_text` is derived from `segments` by the route that saves
them — one writer, so they cannot disagree.

## Lifecycle

- **Start** (Clock page, floating pill) inserts a `requested` row. With a
  client it also opens a punch (`clockIn`, `source: "recorder"`); if that
  target was already running, the punch is *adopted*, not owned, and Stop
  leaves it alone. The calendar event happening now is linked when its
  attendees' domain names the same client, and lends its title.
- **Claim**: the worker polls `POST /api/meeting-notes/work` every two
  seconds; the oldest `requested` row becomes its `recording` by compare-and-
  swap. A request older than 90 s is **failed** instead — a recording of a
  meeting that already ended must never start late. The panel shows amber
  "Starting…" until the claim and says plainly that nobody is recording after
  20 s, Cancel first.
- **Heartbeat**: every 5 s while recording, `POST …/heartbeat { worker,
  levels }`. It updates the meters and answers a verdict — `continue`, `stop`
  (Stop was clicked, or the owned punch was stopped from the widget or the
  watch), `discard`. Stop is never a queue item: only the process holding the
  helper can stop it.
- **Recorded**: `POST …/recorded` moves the row to `recorded`, queues
  transcription **for the same worker** (the WAVs are there), and clocks the
  owned punch out.
- **Transcript**: `POST …/transcript` saves the segments, derives the text
  twin, and writes the notes in the same request (the worker allows three
  minutes). The row lands in `review` and `meetingnotes.ready` fires.
- **Review**: items are proposals. "File selected" swaps each item from
  `proposed` to `accepted` (a second click loses the swap and inserts
  nothing), tasks in the same transaction (`source: meeting_note`, `refKind:
  meeting_note_item`), events through `writeCalendarEvent` with the item id
  as `refKey` and never an attendee. Dismissed items stay, struck, with
  Restore. The note is `filed` once nothing filable is left undecided.
- **Time**: the punch waits in `/timesheet/review` like any other; the note
  page's Time card approves it with the first line of the summary. A note
  with a client and no punch logs its time as an approved `recorder` punch
  plus entry; one with no client is asked to pick one.
- **Sweep** (`lib/tick.ts`, every 15 min): stale requests fail, recorders
  silent for 60 s fail ("lost contact", owned punch clocked out at the last
  beat), transcriptions running past 30 min are requeued up to three times.
- **Never a blank**: when the model refuses or returns nothing, the note still
  gets a title and a summary that says what happened.

## Surfaces

| Route | Shows |
|---|---|
| `/meeting-notes` | Banded list — In progress, Needs review, Filed, Failed, Discarded — the recorder's heartbeat, Paste a transcript, Record. |
| `/meeting-notes/[id]` | Title, client, phase line; summary, topics, decisions, questions; the action items; the Time card; the transcript with speaker chips (mic = Karol, system = Others, renamed per note) and timestamp links. |
| `/timesheet/live` | The Record panel under the clock: same targets plus "No client yet", the onyx recording band with mic/system meters. |
| floating pill | A recording is one onyx pill; Stop stops the recording and the punch it owns. |
| `/clients/[slug]` | A Meeting notes block with the latest notes. |

## Agent doors (device token, `Authorization: Bearer …`)

| Route | Does |
|---|---|
| `POST /api/meeting-notes/work` | `{ worker }` → `{ capture } \| { transcribe } \| { none }`. Capture before transcription. |
| `POST /api/meeting-notes/worker` | Heartbeat; `app_settings.meeting_worker`. |
| `POST /api/meeting-notes/[id]/heartbeat` | `{ worker, levels: { mic, sys } }` → `{ verdict }`. Also keeps a long transcription alive. |
| `POST /api/meeting-notes/[id]/recorded` | `{ worker, durationSec, tracks, recordingPath }`. |
| `POST /api/meeting-notes/[id]/transcript` | `{ worker, segments: [{ start, end, speaker, text }], model, language }`, 4 MB cap. Writes the notes before returning. |
| `POST /api/meeting-notes/[id]/fail` | `{ worker, stage: capture \| transcript, error }`. |
| `GET /api/meeting-notes/[id]` | The row, for the worker's salvage after a restart. |
| `POST /api/meeting-notes` | An import from disk — audio (queued for this worker) or `segments` from a caption file. `GET` lists. |

## The Mac

- **`scripts/meeting-worker.ts`** — `npm run meeting:worker`. Polls, records,
  heartbeats, transcribes, salvages unfinished recordings after a restart,
  prunes raw audio 7 days after upload. `npm run meeting:import <file>
  [--client slug] [--project slug] [--title …] [--date ISO]` takes a Zoom
  recording, a Voice Memo, or a `.vtt`/`.srt`/`.txt`. Files live under
  `~/.daedalus/meetings/<id>/`.
- **`scripts/audio-tap/`** — the capture helper, `TKAudioTap.app`, built by
  `npm run meeting:build-helper`. Engines: a **Core Audio process tap** in an
  aggregate device with the microphone (both tracks on one clock; needs
  Microphone + System Audio Recording), ScreenCaptureKit (macOS 15, needs
  Screen Recording), microphone only. Writes 16 kHz mono WAVs and one JSON
  level line per second; exits on SIGTERM or when its stdin closes, so a dead
  worker cannot leave an orphan recording.
- **Whisper**: `mlx_whisper` by absolute path (`MEETING_WHISPER_BIN`), model
  `MEETING_WHISPER_MODEL` (default `mlx-community/whisper-large-v3-mlx`),
  language auto-detected per track (meetings are Polish and English; the
  notes are always English), speech clips from `ffmpeg silencedetect` so a
  silent mic track does not hallucinate, proper nouns as the initial prompt.
  Mic track → `Karol`, system track → `Others`; a mic line whose words also
  appear in a system line within four seconds is dropped as bleed.
- **`npm run meeting:doctor`** — run from a Terminal: helper built, which
  engine works, the permission prompts (`--record` records three seconds to
  trigger them), Whisper and its model, ffmpeg, the CRM token, the launchd
  agent. With no code-signing identity the helper is ad-hoc signed and a
  rebuild re-prompts for permissions; a free Apple Development certificate
  (`TK_SIGN_IDENTITY`) fixes that.
- **launchd**: `scripts/com.tallkarol.meeting-worker.plist` — copy to
  `~/Library/LaunchAgents/`, `launchctl bootstrap gui/$(id -u) …`. Separate
  from the chat worker on purpose: a two-minute model turn there must never
  delay a recording here. Log: `~/Library/Logs/tallkarol/meeting-worker.log`.

Env (`.env.local`): `CRM_URL`, `CRM_DEVICE_TOKEN`, `MEETING_WORKER_NAME`
(stable — transcription is affine to it), `MEETING_WORKER_DIR`,
`MEETING_HELPER_BIN`, `MEETING_AUDIO_ENGINE` (`auto`), `MEETING_WHISPER_BIN`,
`MEETING_WHISPER_MODEL`, `MEETING_WHISPER_LANGUAGE` (leave unset),
`MEETING_RETENTION_DAYS`. On Railway: `ANTHROPIC_API_KEY`, optionally
`MEETING_NOTES_MODEL`.

## Checks

```bash
npm run check:meeting-notes       # pure: transitions, merge + bleed, parsers, schema, fallback, filing
npm run check:meeting-notes:db    # the spine against the db with a stub model; throwaway rows, cleaned up
npm run db:dry-run 0056_meeting_notes
```

## Decisions (Sep 10, 2026)

- Named "meeting notes", not "meetings"; punch source `recorder`.
- Audio and Whisper on the Mac; notes on the CRM with the Anthropic API.
- Meetings are Polish and English; notes always in English, quotes verbatim.
- Nothing is filed without a click; Start with a client opens a real punch.
- A static design sample was signed off before code.
- Not built: live transcript while recording, a menu-bar button in the Mac
  app, a chat tool over notes, a punch list cut from a transcript, a watched
  drop folder, speaker diarization beyond Karol/Others.
