import { readFileSync, existsSync } from "fs"
import { resolve, sep } from "path"

const ROOT = resolve(process.cwd(), "content/docs")

/**
 * HTML bodies for reports, proposals and worksheets live on disk under
 * content/docs,
 * not in Postgres — the row holds the path, the file holds the document.
 * A slug is the only public handle; the path never leaves the server.
 */
export function readDocHtml(bodyPath: string): string | null {
  if (!bodyPath || bodyPath.includes("\0") || bodyPath.includes("..")) return null
  const clean = bodyPath.replace(/^\/+/, "")
  const file = resolve(ROOT, clean)
  if (!file.startsWith(ROOT + sep) && file !== ROOT) return null
  if (!existsSync(file)) return null
  return readFileSync(file, "utf8")
}
