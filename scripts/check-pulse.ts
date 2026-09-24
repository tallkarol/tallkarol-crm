/**
 * The pulse's pure rules, fed by hand: which stat sets a row's state and
 * colour, and what a folded row still says.
 *   npm run check:pulse
 */
import { buildPulse, digestOf, mailRow, pipelineRow, tasksRow, ticketsRow, type MailFacts, type PipelineFacts, type TaskFacts, type TicketFacts } from "../lib/pulse"

let failed = 0
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok   " : "FAIL "} ${name}${detail && !ok ? ` — ${detail}` : ""}`)
  if (!ok) failed += 1
}

const tickets: TicketFacts = { open: 37, clients: 4, needAnswer: 5, urgent: 3, overdue: 3, oldestOverdueDays: 132, oldestOverdueClient: "Artist House", oldestOverdueHref: "/support/T-1", waiting: 4, oldestWaitingDays: 9 }
const mail: MailFacts = { unread: 10, oldestUnreadDays: 26, owed: 3, oldestOwedDays: 4, backToday: 1, snoozed: 4 }
const tasks: TaskFacts = { overdue: 26, oldestOverdueDays: 19, dueToday: 2, dueTodayFirst: "Send the newsletter", week: 5, nextDue: "Sat 26", waiting: 0, waitingFirst: null, doneWeek: 12, doneToday: 3 }
const pipeline: PipelineFacts = { newLeads: 0, newestLeadDays: null, newestLeadSource: null, talking: 3, oldestTalkingDays: 12, out: [{ name: "DQS", days: 3 }, { name: "Domynovy", days: 9 }], accepted: [{ name: "CAPS Fieldhouse" }] }

console.log("a loud morning")
const t = ticketsRow(tickets)
check("tickets: overdue replies make the row red", t.tone === "bad" && t.state === "3 need you now", `${t.tone} · ${t.state}`)
check("tickets: the overdue stat opens the oldest ticket", t.stats.find((s) => s.key === "overdue")?.href === "/support/T-1")
check("tickets: digest keeps the amber and red stats only", digestOf(t).map((d) => d.text).join(" · ") === "5 need an answer · 3 reply overdue", digestOf(t).map((d) => d.text).join(" · "))
const m = mailRow(mail)
check("mail: replies owed lead the state", m.tone === "bad" && m.state === "3 replies owed", `${m.tone} · ${m.state}`)
check("mail: back today says how many are still snoozed", m.stats.find((s) => s.key === "back")?.hint === "of 4 snoozed")
const k = tasksRow(tasks)
check("tasks: overdue leads, done is the only green", k.tone === "bad" && k.state === "26 overdue" && k.stats.find((s) => s.key === "done")?.tone === "good")
check("tasks: overdue and due today open the list, not a page", k.stats.filter((s) => s.group).map((s) => s.key).join(",") === "overdue,today,week,waiting")
check("tasks: digest never carries the green stat", digestOf(k).every((d) => d.tone !== "good") && digestOf(k).length === 2)
const p = pipelineRow(pipeline)
check("pipeline: proposals out is amber, two names in the hint", p.tone === "warn" && p.state === "2 proposals out" && p.stats.find((s) => s.key === "out")?.hint === "DQS 3d · Domynovy 9d", p.stats.find((s) => s.key === "out")?.hint ?? "")
check("pipeline: accepted names the client", p.stats.find((s) => s.key === "accepted")?.hint === "this month · CAPS Fieldhouse")

console.log("a caught-up morning")
const q = buildPulse({
  tickets: { ...tickets, needAnswer: 0, urgent: 0, overdue: 0, oldestOverdueDays: null, oldestOverdueClient: null, oldestOverdueHref: null },
  mail: { unread: 0, oldestUnreadDays: null, owed: 0, oldestOwedDays: null, backToday: 0, snoozed: 2 },
  tasks: { ...tasks, overdue: 0, oldestOverdueDays: null, dueToday: 0, dueTodayFirst: null },
  pipeline: { ...pipeline, out: [], newLeads: 1, newestLeadDays: 0, newestLeadSource: "the site" },
})
check("rows keep their order", q.rows.map((r) => r.key).join(",") === "tickets,mail,tasks,pipeline")
check("tickets: all answered is green", q.rows[0].tone === "good" && q.rows[0].state === "all answered")
check("mail: caught up is green and folds to nothing", q.rows[1].tone === "good" && q.rows[1].state === "caught up" && digestOf(q.rows[1]).length === 0)
check("tasks: nothing overdue is green", q.rows[2].tone === "good" && q.rows[2].state === "nothing overdue")
check("pipeline: a new lead is amber and says where from", q.rows[3].tone === "warn" && q.rows[3].state === "1 new lead" && q.rows[3].stats[0].hint === "today · via the site", q.rows[3].stats[0].hint ?? "")
check("pipeline: unread mail alone is neutral", mailRow({ unread: 4, oldestUnreadDays: 2, owed: 0, oldestOwedDays: null, backToday: 0, snoozed: 0 }).tone === "neutral")

console.log(failed ? `\n${failed} pulse check(s) failed` : "\nall pulse checks passed")
process.exit(failed ? 1 : 0)
