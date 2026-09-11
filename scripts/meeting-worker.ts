import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, hostname } from "node:os"
import { basename, extname, join, resolve } from "node:path"
import { loadLocalEnv } from "@/lib/load-env"
import {
  mergeTracks,
  parseTranscript,
  reindex,
  SPEAKER_MIC,
  SPEAKER_SYSTEM,
  type RawSegment,
  type TranscriptSegment,
} from "@/lib/meeting-note"
import { crmClient, CrmError, sleep, startHeartbeat } from "./worker-http"

/**
 * The meeting worker.
 *
 * Runs on Karol's Mac — the machine the calls happen on — and does the two
 * things Railway cannot: capture audio and run Whisper. It polls the CRM for
 * work, records through the audio-tap helper, heartbeats while it does, and
 * posts back text only. The audio never leaves this machine.
 *
 *   npm run meeting:worker                 poll forever (launchd keeps it up)
 *   npm run meeting:import <file> [flags]  a Zoom recording, a Voice Memo, a .vtt
 *
 * Needs CRM_URL and CRM_DEVICE_TOKEN (Settings → Devices). See MEETING-NOTES.md.
 */

loadLocalEnv()

const CRM_URL = process.env.CRM_URL || "http://localhost:3001"
const TOKEN = process.env.CRM_DEVICE_TOKEN || ""
/** Stable across restarts on purpose: transcription is affine to the Mac that holds the WAVs. */
const NAME = process.env.MEETING_WORKER_NAME || hostname().split(".")[0]
const DIR = expandHome(process.env.MEETING_WORKER_DIR || "~/.daedalus/meetings")
const HELPER =
  process.env.MEETING_HELPER_BIN ||
  resolve(process.cwd(), "scripts/audio-tap/build/TKAudioTap.app/Contents/MacOS/audio-tap")
const ENGINE = process.env.MEETING_AUDIO_ENGINE || "auto"
const WHISPER = process.env.MEETING_WHISPER_BIN || join(homedir(), "Library/Python/3.9/bin/mlx_whisper")
const WHISPER_MODEL = process.env.MEETING_WHISPER_MODEL || "mlx-community/whisper-large-v3-mlx"
const LANGUAGE = process.env.MEETING_WHISPER_LANGUAGE || ""
const IDLE_MS = Number(process.env.MEETING_WORKER_IDLE_MS || 2000)
const RETENTION_DAYS = Number(process.env.MEETING_RETENTION_DAYS || 7)
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg"

if (!TOKEN) {
  console.error("CRM_DEVICE_TOKEN missing — issue one at Settings → Devices.")
  process.exit(1)
}

const crm = crmClient(CRM_URL, TOKEN)

function expandHome(p: string) {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p
}

function log(...parts: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...parts)
}

/* ------------------------------------------------------------------ */
/* wire shapes                                                          */
/* ------------------------------------------------------------------ */

type CaptureJob = {
  id: string
  title: string
  client: { slug: string; name: string } | null
  project: { slug: string; name: string } | null
  timeZone: string
  vocabulary: string[]
  startedAt: string
}
type TranscribeJob = {
  id: string
  recordingPath: string
  tracks: string[]
  language: string
  timeZone: string
  vocabulary: string[]
  attempt: number
}
type Work = { capture?: CaptureJob; transcribe?: TranscribeJob; none?: true }
type HelperEvent =
  | { event: "started"; engine: string; tracks: string[]; rate: number }
  | { event: "level"; t: number; mic: number; sys?: number }
  | { event: "stopped"; durationSec: number; tracks: string[] }
  | { event: "error"; message: string }

/* ------------------------------------------------------------------ */
/* files                                                                */
/* ------------------------------------------------------------------ */

function noteDir(id: string) {
  return join(DIR, id)
}

/** Seconds of audio in a WAV, from its header — the truth after a crash. */
function wavSeconds(file: string): number {
  try {
    const fd = readFileSync(file)
    if (fd.length < 44 || fd.toString("ascii", 0, 4) !== "RIFF") return 0
    const channels = fd.readUInt16LE(22)
    const rate = fd.readUInt32LE(24)
    const bits = fd.readUInt16LE(34)
    let offset = 12
    let dataBytes = 0
    while (offset + 8 <= fd.length) {
      const id = fd.toString("ascii", offset, offset + 4)
      const size = fd.readUInt32LE(offset + 4)
      if (id === "data") {
        dataBytes = size > 0 && size <= fd.length - offset - 8 ? size : fd.length - offset - 8
        break
      }
      offset += 8 + size + (size % 2)
    }
    const bytesPerSec = rate * channels * (bits / 8)
    return bytesPerSec ? dataBytes / bytesPerSec : 0
  } catch {
    return 0
  }
}

function tracksIn(dir: string): string[] {
  return ["mic", "system", "mixed"].filter((t) => existsSync(join(dir, `${t}.wav`)) && wavSeconds(join(dir, `${t}.wav`)) > 0.5)
}

/* ------------------------------------------------------------------ */
/* capture                                                              */
/* ------------------------------------------------------------------ */

/**
 * Record until the CRM says stop. The helper writes the files; this process
 * holds its stdin (a dead worker closes the pipe and the helper exits), keeps
 * the Mac awake with caffeinate, forwards the per-second levels as a 5 s
 * heartbeat, and obeys the verdict that comes back.
 */
async function runCapture(job: CaptureJob) {
  const dir = noteDir(job.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ ...job, worker: NAME, capturedAt: new Date().toISOString() }, null, 2))
  log(`capture ${job.id} — ${job.title || "(untitled)"}${job.client ? ` · ${job.client.name}` : ""}`)

  if (!existsSync(HELPER)) {
    await failStage(job.id, "capture", `The audio helper is not built (${HELPER}). Run npm run meeting:build-helper.`)
    return
  }

  const helper = spawn(HELPER, ["record", "--dir", dir, "--engine", ENGINE], { stdio: ["pipe", "pipe", "pipe"] })
  const wake = spawn("caffeinate", ["-i", "-w", String(helper.pid)], { stdio: "ignore" })
  wake.on("error", () => undefined)

  // One mutable box, read after the loop: TypeScript narrows closure-assigned
  // locals to `never`, so the helper's events land here instead.
  const seen: {
    latest: { mic: number; sys: number | null } | null
    started: Extract<HelperEvent, { event: "started" }> | null
    stopped: Extract<HelperEvent, { event: "stopped" }> | null
    error: string
  } = { latest: null, started: null, stopped: null, error: "" }
  let buffer = ""
  helper.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8")
    let nl = buffer.indexOf("\n")
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf("\n")
      if (!line) continue
      try {
        const ev = JSON.parse(line) as HelperEvent
        if (ev.event === "level") seen.latest = { mic: ev.mic, sys: ev.sys ?? null }
        else if (ev.event === "started") seen.started = ev
        else if (ev.event === "stopped") seen.stopped = ev
        else if (ev.event === "error") seen.error = ev.message
      } catch {
        /* not JSON — stderr-ish noise on stdout */
      }
    }
  })
  helper.stderr.on("data", (chunk: Buffer) => process.stderr.write(`[helper] ${chunk.toString("utf8")}`))

  const exited = new Promise<number | null>((done) => {
    helper.on("exit", (code) => done(code))
    helper.on("error", (err) => {
      seen.error = err.message
      done(null)
    })
  })

  let verdict: "continue" | "stop" | "discard" = "continue"
  let stopSent = false
  const stopHelper = () => {
    if (stopSent) return
    stopSent = true
    try {
      helper.kill("SIGTERM")
    } catch {
      /* already gone */
    }
  }

  // Give the helper a moment to fail fast (no permission, no device).
  await Promise.race([exited, sleep(1500)])
  if (helper.exitCode != null && !seen.stopped) {
    await failStage(job.id, "capture", seen.error || `The audio helper exited immediately (code ${helper.exitCode}).`)
    wake.kill()
    return
  }

  while (verdict === "continue" && helper.exitCode == null) {
    try {
      const reply = (await crm.post(`/api/meeting-notes/${job.id}/heartbeat`, { worker: NAME, levels: seen.latest }, { timeoutMs: 8000 })) as {
        verdict?: "continue" | "stop" | "discard"
      }
      verdict = reply.verdict ?? "continue"
    } catch (err) {
      // A missed beat is not a reason to stop recording; the CRM's sweep
      // decides that after a minute of silence, and we keep the files.
      if (err instanceof CrmError && (err.status === 404 || err.status === 409)) verdict = "stop"
      else log("heartbeat failed:", (err as Error).message)
    }
    if (verdict === "continue") await Promise.race([exited, sleep(5000)])
  }

  stopHelper()
  const code = await Promise.race([exited, sleep(15_000).then(() => "timeout" as const)])
  if (code === "timeout") {
    helper.kill("SIGKILL")
    await exited
  }
  wake.kill()

  if (verdict === "discard") {
    rmSync(dir, { recursive: true, force: true })
    log(`capture ${job.id} discarded`)
    return
  }

  const tracks = tracksIn(dir)
  const durationSec = Math.round(
    seen.stopped?.durationSec || Math.max(0, ...tracks.map((t) => wavSeconds(join(dir, `${t}.wav`))))
  )
  if (!tracks.length || durationSec === 0) {
    await failStage(job.id, "capture", seen.error || "The helper wrote no audio. Check the microphone and system-audio permissions (npm run meeting:doctor).")
    return
  }
  const engine = seen.started?.engine ?? ENGINE
  writeFileSync(join(dir, "recorded.json"), JSON.stringify({ durationSec, tracks, engine, at: new Date().toISOString() }))
  await postRecorded(job.id, dir, durationSec, tracks)
}

async function postRecorded(id: string, dir: string, durationSec: number, tracks: string[]) {
  try {
    await crm.post(`/api/meeting-notes/${id}/recorded`, { worker: NAME, durationSec, tracks, recordingPath: dir })
    log(`recorded ${id} · ${durationSec}s · ${tracks.join("+")}`)
  } catch (err) {
    log("posting /recorded failed:", (err as Error).message)
  }
}

async function failStage(id: string, stage: "capture" | "transcript", error: string) {
  log(`${stage} failed for ${id}: ${error}`)
  await crm.post(`/api/meeting-notes/${id}/fail`, { worker: NAME, stage, error }).catch(() => undefined)
}

/* ------------------------------------------------------------------ */
/* transcription                                                        */
/* ------------------------------------------------------------------ */

/** Speech regions of a track, so Whisper never stares at silence and invents words. */
function speechClips(file: string): string | null {
  const run = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=noise=-38dB:d=1.5", "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  const out = `${run.stderr ?? ""}${run.stdout ?? ""}`
  const total = wavSeconds(file)
  const starts: number[] = []
  const ends: number[] = []
  const startRe = /silence_start: ([\d.]+)/g
  const endRe = /silence_end: ([\d.]+)/g
  let m: RegExpExecArray | null
  while ((m = startRe.exec(out))) starts.push(Number(m[1]))
  while ((m = endRe.exec(out))) ends.push(Number(m[1]))
  if (!starts.length) return null // no silence found: transcribe everything
  const clips: [number, number][] = []
  let cursor = 0
  for (let i = 0; i < starts.length; i++) {
    const silenceStart = starts[i]
    if (silenceStart - cursor > 0.4) clips.push([Math.max(0, cursor - 0.3), Math.min(total, silenceStart + 0.3)])
    cursor = ends[i] ?? total
  }
  if (total - cursor > 0.4) clips.push([Math.max(0, cursor - 0.3), total])
  if (!clips.length) return "" // all silence
  return clips.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(",")
}

function whisperTrack(file: string, outDir: string, vocabulary: string[]): { segments: RawSegment[]; language: string } {
  const clips = speechClips(file)
  if (clips === "") return { segments: [], language: "" }
  const args = [
    file,
    "--model",
    WHISPER_MODEL,
    "--output-dir",
    outDir,
    "--output-format",
    "json",
    "--verbose",
    "False",
    "--word-timestamps",
    "True",
    "--hallucination-silence-threshold",
    "2",
    "--condition-on-previous-text",
    "False",
  ]
  if (LANGUAGE) args.push("--language", LANGUAGE)
  if (vocabulary.length) args.push("--initial-prompt", vocabulary.join(", "))
  if (clips) args.push("--clip-timestamps", clips)
  const run = spawnSync(WHISPER, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`mlx_whisper failed on ${basename(file)}: ${(run.stderr || run.stdout || "").trim().slice(-600)}`)
  const jsonPath = join(outDir, `${basename(file, extname(file))}.json`)
  if (!existsSync(jsonPath)) throw new Error(`mlx_whisper wrote no JSON for ${basename(file)}`)
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as { language?: string; segments?: { start: number; end: number; text: string }[] }
  return {
    language: parsed.language ?? "",
    segments: (parsed.segments ?? []).map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? "").trim() })),
  }
}

async function runTranscribe(job: TranscribeJob) {
  const dir = job.recordingPath && existsSync(job.recordingPath) ? job.recordingPath : noteDir(job.id)
  log(`transcribe ${job.id} (attempt ${job.attempt}) in ${dir}`)
  if (!existsSync(dir)) {
    await failStage(job.id, "transcript", `No recording on ${NAME} at ${dir}.`)
    return
  }
  const tracks = tracksIn(dir)
  if (!tracks.length) {
    await failStage(job.id, "transcript", "The recording has no audible tracks.")
    return
  }
  if (!existsSync(WHISPER)) {
    await failStage(job.id, "transcript", `mlx_whisper not found at ${WHISPER}. Set MEETING_WHISPER_BIN.`)
    return
  }

  // Beat while Whisper runs so the sweep does not requeue a long meeting.
  const beat = setInterval(() => crm.post(`/api/meeting-notes/${job.id}/heartbeat`, { worker: NAME }, { timeoutMs: 8000 }).catch(() => undefined), 20_000)
  beat.unref()
  try {
    const outDir = join(dir, "whisper")
    mkdirSync(outDir, { recursive: true })
    const started = Date.now()
    const byTrack: Record<string, RawSegment[]> = {}
    let language = job.language || ""
    for (const track of tracks) {
      const result = whisperTrack(join(dir, `${track}.wav`), outDir, job.vocabulary)
      byTrack[track] = result.segments
      if (!language && result.language) language = result.language
      log(`  ${track}: ${result.segments.length} segments (${result.language || "?"})`)
    }
    let segments: TranscriptSegment[]
    if (byTrack.mic || byTrack.system) {
      segments = mergeTracks(byTrack.mic ?? [], byTrack.system ?? [])
    } else {
      segments = reindex(
        (byTrack.mixed ?? []).filter((s) => s.text).map((s) => ({ i: 0, start: s.start, end: s.end, speaker: "", text: s.text }))
      )
    }
    writeFileSync(join(dir, "transcript.json"), JSON.stringify({ language, model: WHISPER_MODEL, segments }, null, 1))
    log(`  merged ${segments.length} segments in ${Math.round((Date.now() - started) / 1000)}s; posting`)
    const reply = (await crm.post(
      `/api/meeting-notes/${job.id}/transcript`,
      { worker: NAME, segments, model: basename(WHISPER_MODEL), language },
      { timeoutMs: 180_000 }
    )) as { url?: string; analysisStatus?: string; proposals?: number }
    writeFileSync(join(dir, "uploaded"), new Date().toISOString())
    log(`  notes ${reply.analysisStatus ?? "?"} · ${reply.proposals ?? 0} proposals · ${crm.base}${reply.url ?? ""}`)
  } catch (err) {
    await failStage(job.id, "transcript", (err as Error).message)
  } finally {
    clearInterval(beat)
  }
}

/* ------------------------------------------------------------------ */
/* salvage and pruning                                                  */
/* ------------------------------------------------------------------ */

/** After a restart: finish what the last process left mid-flight. */
async function salvage() {
  if (!existsSync(DIR)) return
  for (const name of readdirSync(DIR)) {
    const dir = join(DIR, name)
    if (!/^[0-9a-f-]{36}$/.test(name) || !statSync(dir).isDirectory()) continue
    if (existsSync(join(dir, "uploaded"))) continue
    try {
      const reply = (await crm.get(`/api/meeting-notes/${name}`)) as { note?: { status: string; transcriptStatus: string; worker: string } }
      const note = reply.note
      if (!note) continue
      if (["requested", "recording", "stopping"].includes(note.status)) {
        const tracks = tracksIn(dir)
        const durationSec = Math.round(Math.max(0, ...tracks.map((t) => wavSeconds(join(dir, `${t}.wav`)))))
        if (tracks.length && durationSec > 0) await postRecorded(name, dir, durationSec, tracks)
        else await failStage(name, "capture", "The worker restarted and found no usable audio for this recording.")
      }
      // `recorded` + queued is picked up by the normal poll; nothing to do here.
    } catch (err) {
      if (err instanceof CrmError && err.status === 404) rmSync(dir, { recursive: true, force: true })
      else log("salvage failed for", name, (err as Error).message)
    }
  }
}

/** Raw audio is kept a week after upload, then removed. The CRM has the text. */
function prune() {
  if (!existsSync(DIR)) return
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000
  for (const name of readdirSync(DIR)) {
    const dir = join(DIR, name)
    const marker = join(dir, "uploaded")
    if (!existsSync(marker)) continue
    if (statSync(marker).mtimeMs < cutoff) {
      rmSync(dir, { recursive: true, force: true })
      log(`pruned ${name}`)
    }
  }
}

/* ------------------------------------------------------------------ */
/* import                                                               */
/* ------------------------------------------------------------------ */

const TEXT_EXT = new Set([".vtt", ".srt", ".txt", ".md"])

async function importFile(argv: string[]) {
  const file = argv.find((a) => !a.startsWith("--"))
  if (!file || !existsSync(file)) {
    console.error("Usage: npm run meeting:import -- <file> [--client slug] [--project slug] [--title text] [--date ISO]")
    process.exit(1)
  }
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const stat = statSync(file)
  const startedAt = flag("date") ? new Date(flag("date")!).toISOString() : stat.mtime.toISOString()
  const title = flag("title") ?? basename(file, extname(file)).replace(/[_-]+/g, " ")
  const base = { worker: NAME, title, clientSlug: flag("client"), projectSlug: flag("project"), startedAt, clientRequestId: `import:${resolve(file)}:${stat.size}` }

  if (TEXT_EXT.has(extname(file).toLowerCase())) {
    const parsed = parseTranscript(readFileSync(file, "utf8"))
    if (!parsed.segments.length) throw new Error("Nothing readable in that file.")
    const reply = (await crm.post("/api/meeting-notes", { ...base, segments: parsed.segments, model: `imported ${parsed.format}` }, { timeoutMs: 180_000 })) as { url: string; replayed: boolean }
    console.log(`${reply.replayed ? "already imported" : "imported"} → ${crm.base}${reply.url}`)
    return
  }

  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" })
  const durationSec = Math.round(Number(probe.stdout.trim()) || 0)
  const reply = (await crm.post("/api/meeting-notes", { ...base, durationSec, tracks: ["mixed"] })) as { id: string; url: string; replayed: boolean }
  const dir = noteDir(reply.id)
  mkdirSync(dir, { recursive: true })
  if (!existsSync(join(dir, "mixed.wav"))) {
    const conv = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", join(dir, "mixed.wav")], { encoding: "utf8" })
    if (conv.status !== 0) throw new Error(`ffmpeg could not read ${file}: ${conv.stderr}`)
  }
  copyFileSync(file, join(dir, `source${extname(file)}`))
  console.log(`${reply.replayed ? "already imported" : "queued"} → ${crm.base}${reply.url}`)
  // Transcribe right away rather than waiting for the loop, so the command returns with notes.
  const work = (await crm.post("/api/meeting-notes/work", { worker: NAME })) as Work
  if (work.transcribe && work.transcribe.id === reply.id) await runTranscribe(work.transcribe)
  else if (work.transcribe) await runTranscribe(work.transcribe)
  else console.log("The recording is queued; the worker loop will transcribe it.")
}

/* ------------------------------------------------------------------ */
/* the loop                                                             */
/* ------------------------------------------------------------------ */

async function loop() {
  mkdirSync(DIR, { recursive: true })
  log(`meeting worker ${NAME} → ${CRM_URL} · files in ${DIR} · helper ${existsSync(HELPER) ? "ok" : "MISSING"} · whisper ${existsSync(WHISPER) ? "ok" : "MISSING"}`)
  const stopBeat = startHeartbeat(crm, "/api/meeting-notes/worker", NAME)
  await salvage()
  prune()
  let lastPrune = Date.now()
  for (;;) {
    try {
      const work = (await crm.post("/api/meeting-notes/work", { worker: NAME })) as Work
      if (work.capture) {
        await runCapture(work.capture)
        continue
      }
      if (work.transcribe) {
        await runTranscribe(work.transcribe)
        continue
      }
    } catch (err) {
      log("poll failed:", (err as Error).message)
    }
    if (Date.now() - lastPrune > 6 * 3_600_000) {
      prune()
      lastPrune = Date.now()
    }
    await sleep(IDLE_MS)
  }
  // eslint-disable-next-line no-unreachable
  stopBeat()
}

const [command, ...rest] = process.argv.slice(2)
if (command === "import") {
  importFile(rest).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
} else {
  void loop()
}
