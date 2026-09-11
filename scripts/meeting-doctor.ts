import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { loadLocalEnv } from "@/lib/load-env"
import { crmClient } from "./worker-http"

/**
 * Is this Mac ready to record and transcribe? Run it from a Terminal — the
 * first run triggers the macOS permission prompts (Microphone, System Audio
 * Recording), and a launchd job cannot show those.
 *
 *   npm run meeting:doctor            checks only
 *   npm run meeting:doctor -- --record  also records 3 seconds to trigger the prompts
 */

loadLocalEnv()

const HELPER = process.env.MEETING_HELPER_BIN || resolve(process.cwd(), "scripts/audio-tap/build/TKAudioTap.app/Contents/MacOS/audio-tap")
const WHISPER = process.env.MEETING_WHISPER_BIN || join(homedir(), "Library/Python/3.9/bin/mlx_whisper")
const MODEL = process.env.MEETING_WHISPER_MODEL || "mlx-community/whisper-large-v3-mlx"
const CRM_URL = process.env.CRM_URL || "http://localhost:3001"
const TOKEN = process.env.CRM_DEVICE_TOKEN || ""
const record = process.argv.includes("--record")

let bad = 0
const ok = (label: string, detail = "") => console.log(`  ok    ${label}${detail ? ` — ${detail}` : ""}`)
const warn = (label: string, detail = "") => console.log(`  warn  ${label}${detail ? ` — ${detail}` : ""}`)
const fail = (label: string, detail = "") => {
  bad += 1
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
}

async function main() {
  console.log(`meeting doctor · ${new Date().toISOString().slice(0, 16)}\n`)

  console.log("helper")
  if (!existsSync(HELPER)) {
    fail("audio helper not built", `run npm run meeting:build-helper (expected ${HELPER})`)
  } else {
    ok("audio helper present", HELPER)
    const probe = spawnSync(HELPER, ["probe"], { encoding: "utf8", timeout: 8000 })
    const line = (probe.stdout || "").trim().split("\n").pop() ?? ""
    try {
      const parsed = JSON.parse(line) as { engines?: Record<string, string>; defaultInput?: string | null; macos?: string }
      const e = parsed.engines ?? {}
      console.log(`        macOS ${parsed.macos ?? "?"} · default input: ${parsed.defaultInput ?? "none"}`)
      for (const [name, state] of Object.entries(e)) {
        if (state === "ok") ok(`engine ${name}`)
        else if (state === "denied") fail(`engine ${name} denied`, "System Settings → Privacy & Security → grant TKAudioTap")
        else if (state === "undetermined") warn(`engine ${name} not asked yet`, "run with --record from a Terminal to trigger the prompt")
        else warn(`engine ${name} ${state}`)
      }
      const working = Object.entries(e).find(([, s]) => s === "ok")
      if (working) ok("recorder will use", working[0])
      else fail("no engine works", "grant the permissions above, then rerun")
    } catch {
      fail("probe returned no JSON", (probe.stderr || probe.stdout || String(probe.error ?? "")).trim().slice(0, 300))
    }
    const identities = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" }).stdout ?? ""
    if (/0 valid identities/.test(identities) || !identities.trim()) {
      warn("helper is ad-hoc signed", "every rebuild re-prompts for permissions — create a free Apple Development certificate in Xcode and set TK_SIGN_IDENTITY")
    } else ok("code-signing identity available", identities.trim().split("\n")[0])

    if (record) {
      console.log("\nrecording 3 seconds to trigger the permission prompts…")
      const dir = mkdtempSync(join(tmpdir(), "tk-doctor-"))
      const child = spawnSync(HELPER, ["record", "--dir", dir, "--engine", "auto"], { encoding: "utf8", timeout: 6000, killSignal: "SIGTERM" })
      const events = (child.stdout || "").trim().split("\n").filter(Boolean)
      console.log(events.map((l) => `        ${l}`).join("\n") || "        (no output)")
      const files = existsSync(dir) ? readdirSync(dir) : []
      if (files.length) ok("files written", files.join(", "))
      else fail("nothing recorded", "answer the prompts and run again")
      rmSync(dir, { recursive: true, force: true })
    }
  }

  console.log("\nwhisper")
  if (!existsSync(WHISPER)) fail("mlx_whisper not found", `expected ${WHISPER} — set MEETING_WHISPER_BIN`)
  else {
    const v = spawnSync(WHISPER, ["--help"], { encoding: "utf8", timeout: 20_000 })
    if (v.status === 0) ok("mlx_whisper runs", WHISPER)
    else fail("mlx_whisper does not run", (v.stderr || "").trim().slice(-300))
  }
  const cache = join(homedir(), ".cache/huggingface/hub", `models--${MODEL.replace("/", "--")}`)
  if (existsSync(cache)) ok("model cached", MODEL)
  else warn("model not cached", `${MODEL} downloads on first use (~1.5–3 GB): ${WHISPER} /dev/null --model ${MODEL}`)
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" })
  if (ff.status === 0) ok("ffmpeg", ff.stdout.split("\n")[0].split(" ").slice(0, 3).join(" "))
  else fail("ffmpeg missing", "brew install ffmpeg")

  console.log("\ncrm")
  if (!TOKEN) fail("CRM_DEVICE_TOKEN missing", "issue one at Settings → Devices and put it in .env.local")
  else {
    const crm = crmClient(CRM_URL, TOKEN)
    try {
      await crm.post("/api/meeting-notes/worker", { worker: `doctor@${process.env.MEETING_WORKER_NAME || "mac"}` }, { timeoutMs: 10_000 })
      ok("CRM reachable with the token", CRM_URL)
    } catch (err) {
      fail("CRM refused", (err as Error).message)
    }
  }
  const plist = join(homedir(), "Library/LaunchAgents/com.tallkarol.meeting-worker.plist")
  if (existsSync(plist)) {
    const state = spawnSync("launchctl", ["print", `gui/${process.getuid?.() ?? 501}/com.tallkarol.meeting-worker`], { encoding: "utf8" })
    if (state.status === 0) ok("launchd agent loaded", (state.stdout.match(/state = (\w+)/) ?? [])[1] ?? "")
    else warn("launchd plist copied but not loaded", `launchctl bootstrap gui/$(id -u) ${plist}`)
  } else warn("launchd agent not installed", "cp scripts/com.tallkarol.meeting-worker.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tallkarol.meeting-worker.plist")

  console.log(bad ? `\n${bad} problem${bad === 1 ? "" : "s"}` : "\nready")
  process.exit(bad ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
