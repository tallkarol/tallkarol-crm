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
