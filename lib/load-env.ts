import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

export function loadLocalEnv() {
  const file = resolve(process.cwd(), ".env.local")
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i === -1) continue
    const key = t.slice(0, i)
    let value = t.slice(i + 1)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null) process.env[key] = value
  }
}

/**
 * The chat worker's environment — an allow-list, not the file.
 *
 * `.env.local` in the checkout holds the dev server's secrets (DATABASE_URL,
 * VAULT_SECRET, the Google service account). The worker must not carry
 * those: it is the process a skill turn hands a shell to, and CHAT.md's
 * whole trust story is that it holds a device token and nothing else. So it
 * takes only its own keys, from `~/.daedalus/chat-worker.env` when that
 * exists and otherwise from the checkout's `.env.local` — and the npm script
 * that starts it no longer loads the file wholesale.
 */
export const WORKER_ENV_KEYS = [
  "CRM_URL",
  "CRM_DEVICE_TOKEN",
  "CURSOR_API_KEY",
  "CHAT_WORKER_NAME",
  "CHAT_WORKER_IDLE_MS",
  "CHAT_WORKER_REPO",
  "CHAT_WORKER_SKILLS",
  "CHAT_WORKER_SOLVE_DIR",
  "CHAT_WORKER_PERSONAS",
  "DAEDALUS_CLIENT_PACKS",
  "DAEDALUS_ME",
] as const

export function loadWorkerEnv(keys: readonly string[] = WORKER_ENV_KEYS) {
  const wanted = new Set(keys)
  const home = process.env.HOME ?? ""
  const files = [
    home ? resolve(home, ".daedalus", "chat-worker.env") : "",
    resolve(process.cwd(), ".env.local"),
  ].filter(Boolean)
  for (const file of files) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const i = t.indexOf("=")
      if (i === -1) continue
      const key = t.slice(0, i).replace(/^export\s+/, "")
      if (!wanted.has(key)) continue
      let value = t.slice(i + 1)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] == null) process.env[key] = value
    }
  }
}
