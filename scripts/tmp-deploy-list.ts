/** Read-only: list recent frontend deployments with their commits. Delete after. */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

const PROJECT = "prj_qTQqWFEc3jaYZNktyFCe7z3w0cHG"

async function main() {
  const token = process.env.VERCEL_TOKEN
  const team = process.env.VERCEL_TEAM_ID
  const url =
    `https://api.vercel.com/v6/deployments?projectId=${PROJECT}&limit=15` +
    (team ? `&teamId=${team}` : "")
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
  const json: any = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300))

  for (const d of json.deployments ?? []) {
    console.log(
      `${d.state.padEnd(9)} ${String(d.target ?? "preview").padEnd(11)} ` +
        `${(d.meta?.githubCommitSha ?? "").slice(0, 7).padEnd(8)} ` +
        `${new Date(d.created).toISOString().slice(0, 16)}  ${d.url}`
    )
    const msg = (d.meta?.githubCommitMessage ?? "").split("\n")[0]
    if (msg) console.log(`          ${msg}`)
  }
}

main().catch((e) => {
  console.error("FATAL", e.message)
  process.exit(1)
})
