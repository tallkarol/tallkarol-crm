import { writeFileSync } from "node:fs"
import { Cursor } from "@cursor/sdk"

/**
 * Snapshot Cursor's model catalog into content/cursor-models.json.
 *
 *   npm run cursor:models        (needs CURSOR_API_KEY in .env.local)
 *
 * The chat registry (lib/chat/models.ts) names a Cursor model id and an
 * effort per rung, and Cursor is strict about both: `claude-fable-5.1` is
 * refused because the id is `claude-fable-5-1`, and the effort parameter is
 * `effort` on Grok 4.6, Fable and Opus but `reasoning` on Sol and
 * `reasoning_effort` on Grok 4.7. A wrong id fails the turn; a wrong
 * parameter name is ignored, so the rung silently runs at default effort.
 * `check:chat` holds every rung to this file, so a rename on Cursor's side
 * shows up as a failed check the next time this is refreshed — not as a
 * coach that cannot answer.
 */
async function main() {
  const list = (await Cursor.models.list({ apiKey: process.env.CURSOR_API_KEY })) as {
    id: string
    displayName: string
    aliases?: string[]
    parameters?: { id: string; values: { value: string }[] }[]
  }[]
  const models: Record<string, { displayName: string; aliases: string[]; parameters: Record<string, string[]> }> = {}
  for (const m of list) {
    const parameters: Record<string, string[]> = {}
    for (const p of m.parameters ?? []) parameters[p.id] = p.values.map((v) => v.value)
    models[m.id] = { displayName: m.displayName, aliases: m.aliases ?? [], parameters }
  }
  const out = { fetchedAt: new Date().toISOString(), models }
  writeFileSync("content/cursor-models.json", JSON.stringify(out, null, 2) + "\n")
  console.log(`${list.length} models written to content/cursor-models.json`)
}

void main()
