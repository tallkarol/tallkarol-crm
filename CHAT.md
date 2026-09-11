# Chat

An assistant inside the CRM that answers questions about the work and performs
actions against it. "What did I work on for Mineralife in June", "log three
hours to the toll filling page", "find the session where the UWD build broke".

Two things make it different from a chat box wired to an API key: the model is
chosen per request by a ladder that starts cheap and only climbs on evidence,
and nothing it proposes reaches a table until Karol confirms it.

## Why the brain is not on Railway

Composer and Grok are reachable through the Cursor SDK against the Ultra
allowance. They are not reachable through any HTTP API a Railway process could
call. Running the assistant inside the web service would mean paying Anthropic
or OpenAI list price for work the Ultra plan already covers.

So the work is split:

| Side | Runs | Holds | Decides |
|---|---|---|---|
| **CRM** (Railway) | routing, budget, tools, approvals, UI | database, Google creds, everything | which model runs, and whether a write happens |
| **Worker** (Karol's Mac) | the agent, via `@cursor/sdk` | one device token | nothing |

The worker claims a turn, runs the model, and posts back a reply plus any
writes it wants to make. It has no database credentials. A compromised worker
can waste tokens and lie in a chat bubble; it cannot touch the timesheet.

This also mirrors `punchlist_test_runs`: a queue table the Mac polls and claims,
with no server-side runner. Same shape, same reasons.

## Objects

| Table | Holds |
|---|---|
| `chat_threads` | A conversation. Titled from its first line. `task_id` set when it was opened from a task. |
| `chat_messages` | What was said. `role` is user / assistant / tool / system. |
| `chat_turns` | One attempt at answering, **and** its billing record. |
| `chat_tool_calls` | What the assistant did or wants to do. |

`chat_turns` is the load-bearing one. It carries the routing decision (`jobType`,
`model`, `effort`, `pool`, `rung`), the queue state (`status`, `claimedBy`), and
the cost (`inputTokens` … `costCents`). Recording all three on one row is what
makes the ladder trace in the UI and the month's spend impossible to disagree —
they are the same rows read two ways.

**Escalation is rows, not a column.** Rung 0 runs and fails its detector; a
second turn lands with `escalatedFrom` pointing back and `rung` incremented.
Reading the chain is reading the ladder.

## Ladders

Defined in `lib/chat/models.ts`, guarded by `npm run check:chat`.

A ladder is only worth having when the cheap rung wins often enough to pay for
the retry. The break-even is `cost_cheap / cost_expensive` — the share of
attempts the cheap model must get right before "try cheap, escalate on failure"
beats going straight to the expensive one. `check:chat` computes it for every
adjacent pair and fails the build on a rung that loses money.

| Job | Ladder | Promoted by |
|---|---|---|
| `chat` | Composer 2.5 | — |
| `trivial_edit` | Composer 2.5 → Grok 4.6 High | lint, build |
| `content_edit` | Composer 2.5 → Grok 4.6 High | terminology and schema validators |
| `build_fix` | Composer 2.5 → Grok 4.6 High | compiler exit code |
| `code_tested` | Grok 4.6 Medium → XHigh → Fable 5.1 Max | test suite |
| `debug` | Grok 4.6 XHigh → Opus 5 Max | repro still fails |
| `review` | Grok 4.6 XHigh | — |
| `review_critical` | GPT-5.6 Sol Max | — |
| `security_review` | Opus 5 Max | — |
| `architecture` | Opus 5 Max | — |
| `writing` | Fable 5.1 High | — |
| `report` | Composer 2.5 → Grok 4.6 High | section schema |
| `skill` | Grok 4.6 High | — |
| `task` | Grok 4.6 High | — |
| `persona` | Grok 4.6 High | — |
| `judgment` | Opus 5 High | — |

A thread addressed to a desk runs on `persona` — pm, client manager,
developer, marketer: frequent, tool-heavy, factual, on the allowance. The
desks judged on getting close on the first answer run on the Other pool:
coach, copywriter and dreamer on `writing` (Fable 5.1 High), product owner
and designer on `judgment` (Opus 5 High). `lib/chat/personas.ts` is the
dial.

`skill` is any message that starts with a `/command` the hive mind knows
(`lib/chat/skills.ts` reads the names from the committed scan). It is not a
question to answer but a procedure to run, so it skips the chat rung and the
worker hands the model the command file — see "Skill turns" below.

**Ladders exist only where a machine can tell us the attempt failed, for free.**
A test suite, a compiler, a validator. Security review, architecture and brand
voice have no such detector — a missed finding produces no signal at all — so a
cheap first pass there proves nothing and those go straight to the tier that
should have run first.

Within a family, raise effort before changing family: a high-effort failure
usually means the approach was wrong, not that the model was small.

`code_tested` ends on a different family on purpose, and so does `debug`. Two
attempts from the same model tend to fail the same way.

### Turns that failed without a detector do not escalate

`POST /api/chat/turns/[id]` only queues the next rung when the failure carries a
`detector`. A dropped connection or a missing API key is not evidence the model
was too small, and promoting on it spends a frontier model to hit the same wall.

## Pools and the reserve

Ultra includes a large Cursor Models allowance (Composer, Grok) plus **$400** of
Other Models (Fable, Opus, Sol). Spillover runs one way: an exhausted Cursor
pool starts eating the same $400. So `cursor` is cheap and second in line, never
free.

`lib/chat/budget.ts` prices every turn from the registry and holds **$250 of the
$400 in reserve**. Past that line routine first-rung work is refused the Other
pool and falls back to Grok 4.6 XHigh; escalations may still spend it. Past 90%
nothing gets it. Left alone, ordinary work drifts onto premium models and the
escalations that actually need them arrive in week three to an empty allowance.

Two caveats, both deliberate:

- **The ledger is a floor, not a bill.** `agent.getUsage()` settles late and does
  not report subagent tokens, so we price our own turns from published rates and
  reconcile against the Cursor dashboard.
- **The period is the calendar month**, not Karol's billing day, which we do not
  know. Wrong by at most a few days of spend.

## Tools

`lib/chat/tools.ts`. Every tool is a thin wrapper over logic that already
exists and is already tested. The model picks the tool and the arguments; it
never writes SQL and cannot reach anything not on this list.

| Tool | Wraps | Writes |
|---|---|---|
| `search_work_history` | `ledgerEntries` (`lib/sheets.ts`) | no |
| `search_sessions` | `searchSessions` (`lib/leftoff-history.ts`) | no |
| `list_clients` | `clients` + `projects` | no |
| `peek_agent_mailbox` | `peekAgentMailbox` (`lib/inbox-sync.ts`) | no |
| `list_inbox` | `loadInbox` (`lib/inbox-data.ts`) | no |
| `read_mail` | `loadInboxMail` / `readAgentMail` | no |
| `search_mail` | `searchInboxMail` | no |
| `list_leftoff` | `loadLeftOff` | no |
| `list_waiting` | `loadWaiting` | no |
| `list_tasks` | `listTasks` | no |
| `list_calendar` | `getMeetingsInWindow` | no |
| `create_calendar_event` | `writeCalendarEvent` | **yes** |
| `list_inspiration` | `listBoards` / `listPinsOnBoard` | no |
| `pin_inspiration` | `pinInspiration` (`lib/inspiration-data.ts`) | **yes** |
| `sync_inbox` | `runInboxSync` | **yes** |
| `archive_inbox_item` | `setInboxItemState` | **yes** |
| `snooze_inbox_item` | `snoozeInboxItem` | **yes** |
| `assign_inbox_item` | `assignInboxClient` | **yes** |
| `inbox_to_ticket` | `mailToTicketById` | **yes** |
| `inbox_to_task` | `makeInboxTask` | **yes** |
| `dismiss_leftoff` | `dismissNote` | **yes** |
| `complete_task` | `completeTask` | **yes** |
| `reschedule_task` | direct `tasks` update | **yes** |
| `propose_pack_line` | `pack-lines.ts`, written by the **worker** on the Mac | **yes** |
| `route_to` | `send()` — a new thread addressed to another desk, the brief as its first message | **yes** |
| `log_time` | `logAgentTime` (`lib/punches.ts`) | **yes** |
| `create_task` | `resolveTaskTarget` + `insertTaskRow` | **yes** |
| `refresh_insights` | `refreshInsightsAction` | **yes** |

`peek_agent_mailbox` is the live JMAP read of **agent@** — id, headers, and
snippet, nothing written, nothing sent. `read_mail` opens one of those by
id or subject, live, so a message does not have to be synced first.
`list_inbox` / `search_mail` read what has already landed in `inbox_mail`.
`sync_inbox` is the write that files copies across; its preview is a dry run
of the same planner the CLI uses.

`create_calendar_event` writes through `writeCalendarEvent`. Personal / life
blocks default to **Personal** (`karolzbuczek@gmail.com`). Work / client
meetings go on **Remote**. The New-event form still uses the Destination
flag (Remote) when no calendar is named.

Reads run on the worker and come back as results. **Writes never run on the
worker.** They arrive as intentions, park at `pending`, render a preview card,
and are executed by the CRM under Karol's user only after he confirms. The
agent never sends mail.

The preview is built by the same tool that performs the write, from the same
arguments, so the card cannot describe one time entry and file another.

**One exception, stated precisely.** A write whose target lives on the Mac —
a line in a pack file — cannot run in the CRM, because the CRM has no pack
files; and it cannot run before approval, because nothing does. So a tool
may declare `executor: "worker"`: it previews here like any other, parks at
`pending`, and on Confirm moves to `approved` instead of running. The worker
claims it through `POST /api/chat/pack-writes` (compare-and-swap, the queue's
idiom), renders the identical row with the same pure functions
(`lib/chat/pack-lines.ts`), appends it to `relationship.md`, `decisions.md`
or `journal/YYYY-MM-DD.md`, commits that one file — never `add -A`, never a
push — and reports `{file, commit}` or `{error}` to
`POST /api/chat/pack-writes/[id]`. The rule holds in both directions: CRM
tables are written by the CRM under Karol's user; pack files are written by
the Mac after Karol approved; the worker still holds no database credential.
The target pack is the thread's, read from `chat_threads` when the line is
proposed — a desk cannot aim a line at another pack, and only the rows the
persona contracts name are reachable (the client manager's relationship
rows, the product owner's decisions, the coach's journal). A target the desk
may not write fails as a visible row on the card. **The card pins the desk
and the pack** (its Desk and Pack fields); the claim hands the worker those,
never the thread's current address — re-addressing the thread after
approving cannot move the line to another client.

On the Mac the write is honest about git: "already landed" is decided
against `HEAD`, not the working copy, so a worker that died between the
write and the commit leaves a line to commit, not a line to skip; a file
that is already dirty in the packs tree is refused, never swept into the
desk's commit; anything that fails after the write is rolled back (bytes
restored, a file this attempt created removed, the index reset), so a
failed card really means nothing on disk; a per-repo lock
(`.git/crm-pack-write.lock`) keeps two workers from dropping each other's
lines, and `HEAD` is checked for the marker after the commit. The settle
report names its worker and is refused (409) from any other. The row
carries `<!-- crm:<idempotency key> -->`, so a retried write finds its own
marker and changes nothing.

`chat_tool_calls.idempotencyKey` travels into the domain write — into
`logAgentTime`'s `clientRequestId`, into the task's `refId`, into the
Google event's `tk_ref` — so confirming twice, or a retry after a dropped
connection, cannot double-apply.

### `log_time` invents a clock face

`logAgentTime` wants an interval; the chat only ever knows a day and a duration.
The window ends at 17:00 UTC on the day worked and runs backwards. The hours are
what bill — the times are decoration that keeps the punch row well-formed.

## Routes

All on device-token auth (`authenticateTimeRequest`), same as `/api/time/*`.

| Route | Who calls it |
|---|---|
| `POST /api/chat` | phone shortcut, script. Queues a turn, returns the routing decision. |
| `POST /api/chat/queue` | **worker.** Claims the oldest queued turn, returns thread + tools + model. |
| `POST /api/chat/turns/[id]` | **worker.** Posts the reply, or an error (with a `detector` to escalate). |
| `POST /api/chat/approvals/[id]` | confirm or reject a parked write. |
| `POST /api/chat/pack-writes` | **worker.** Claims the oldest approved pack line (a claim older than five minutes with no outcome is claimable again). |
| `POST /api/chat/pack-writes/[id]` | **worker.** Reports `{file, commit, changed}` or `{error}` for a claimed pack line. |
| `POST /api/chat/worker` | **worker.** Heartbeat only. Separate from `queue` so a busy worker can say it is alive without claiming more work. |

The browser does not use these — `lib/chat/actions.ts` holds server actions that
call the same functions in `lib/chat/turns.ts`, so a shortcut and the page
cannot drift apart.

Claiming is a compare-and-swap, not a held transaction: read the oldest queued
id, update `where id = ? and status = 'queued'`, and an empty result means
another worker won. The loser takes the next one.

## Checks

| Command | Touches the DB | What it guards |
|---|---|---|
| `npm run check:chat` | no | Ladder arithmetic — every rung pair must clear its break-even, rungs must climb in price, and nothing escalates without a detector. |
| `npm run check:chat:db` | yes | The spine end to end: routing, claiming, both kinds of tool, pricing, approval, the escalation chain. Creates one throwaway thread and deletes it. |

`check:chat:db` rejects the write it proposes rather than confirming it, so it
never creates a time entry or a task.

## Running the worker

Issue a device token at **Settings → Devices**, then:

```sh
export CRM_URL=https://crm.tallkarol.com
export CRM_DEVICE_TOKEN=…
npm run chat:worker
```

| Variable | Purpose |
|---|---|
| `CRM_URL` | Defaults to `http://localhost:3001`. |
| `CRM_DEVICE_TOKEN` | Required. Settings → Devices. |
| `CURSOR_API_KEY` | Cursor SDK auth. |
| `CHAT_WORKER_NAME` | Shows in `chat_turns.claimedBy`. Defaults to `mac-<pid>`. |
| `CHAT_WORKER_REPO` | Repo the agent runs against, for jobs that touch code. |
| `CHAT_WORKER_IDLE_MS` | Poll interval when the queue is empty. Default 2500. |
| `CHAT_WORKER_SKILLS` | Directory holding `commands/<name>.md` and `skills/<name>/SKILL.md` — normally `~/.claude`. **Unset, skill turns AND task turns are refused.** |
| `CHAT_WORKER_SOLVE_DIR` | Where task turns cut their worktrees. Default `~/.daedalus/solve`. |
| `CHAT_WORKER_PERSONAS` | The hive mind's `personas/` directory. Default `$CHAT_WORKER_SKILLS/personas` (`~/.claude/personas`). Persona turns need it and the `agents/` sibling. |
| `DAEDALUS_CLIENT_PACKS` | The packs repo a desk may load (`clients/<slug>`, `products/<slug>`). Default `~/Work/daedalus-client-packs`. |
| `DAEDALUS_ME` | Karol's private `me` pack, read by the coach alone. Default `~/Work/daedalus-me`. |

### Skill turns

A `/command` message is queued as a `skill` job. The claim carries
`command: { name, args }`, parsed on the CRM side from the message so the
worker never decides what it may run. The worker then does what Claude Code
does with a slash command: reads `commands/<name>.md` from
`CHAT_WORKER_SKILLS`, strips the frontmatter, fills in `$ARGUMENTS`, and
runs the model on that with the CRM tools alongside. The reply comes back
with `agent: "/name"`, so the thread shows who answered.

**This is the one place the worker's trust boundary opens.** A chat turn
runs with `tools: ["mcp"]` — the CRM callbacks and nothing else. A skill
turn runs with read, shell, grep, glob, ls and edit as well, because a
SKILL.md has scripts to run and files to read, and a "/clock status"
answered by a model with no shell would be a confident guess about the
timeclock. So the grant is made in the worker's own environment: without
`CHAT_WORKER_SKILLS` the turn fails with a plain error in the thread and
nothing escalates. The CRM cannot switch it on remotely.

The launchd plist in `scripts/` sets it. Copy it over and re-bootstrap after
changing it — launchd reads its own copy.

Nothing about the worker is deployed. Railway runs the CRM; the queue simply
sits until a Mac is awake, which is also the honest failure mode — a turn
queued at 2am answers when Karol opens the laptop.

### Task threads

A task card's **Solve in chat** opens a thread with `chat_threads.task_id`
set and posts the task as the first message — title, where it belongs,
due, notes, checklist, punch-list item, CRM link (`lib/chat/task-brief.ts`,
pure; `lib/chat/task-thread.ts`, the db side). One live thread per task: a
second click lands in the same one, an archived thread means start over.

The thread, not the message, decides the ladder. `send()` asks `jobFor()`:
a `/command` still wins, a thread with a task runs every message as a `task`
job, everything else is classified by what it says. So "try the other
approach" inside a task thread does not fall back to a chat model with no
shell. The `task` ladder is one rung, Grok 4.6 High, no detector — like
`skill`, and for the same reason: the project's own checks run inside the
turn, and a solve that fell short says so in prose.

The claim carries `task` — the brief re-read from the table on every claim,
the client, project and product, and the branch name `solve/<first 8 of the
task id>`. On the Mac the worker maps the client's slug to a working copy
through `~/.daedalus/leftoff-repos.conf`, the same file the left-off board
and the meter read (a Local by Flywheel site is listed there but is not a
repo, so its themes and plugins under `wp-content` are the candidates). One
match: the worker cuts a git worktree of it under `CHAT_WORKER_SOLVE_DIR` on
the solve branch, from the checkout's HEAD, symlinks `node_modules` in when
the checkout has one, and runs the model there with the skill toolset —
read, shell, grep, glob, ls, edit. The checkout itself is never touched:
another session may be mid-edit in it. Several matches: the project's name
narrows them, then anything Karol named in the thread; still several, the
model gets the list and asks. A match that is not a git repo runs in place
with edit off. No match: CRM tools only, and the reply says how to map one.

The prompt's rules: edit only inside the worktree, commit on the branch,
never push, never touch `main`, run the project's checks before claiming
anything, do not mark the task done. The reply comes back as **Solver**
under four headings — Found, Changed, Verified, Left for Karol. Merging the
branch, and removing the worktree afterwards, is his.

Same trust boundary as skill turns: without `CHAT_WORKER_SKILLS` a task
turn is refused with a plain error. The CRM cannot switch it on.

### Persona threads

A thread can be addressed to one of the hive mind's **desks** — `@coach`,
`@pm`, `@dreamer`, `@client-manager zemvelo`, `@product-owner momentum`,
`@developer`, `@designer`, `@marketer`, `@copywriter` — or with
`/as <persona> [slug]`, which is the same grammar the plugin's `/as` command
uses in Claude Code. `lib/chat/personas.ts` is the roster the chat knows:
the desk's label, the ladder its turns run on, the kind of pack it may pin,
and whether its threads are private. WHO the desk is lives in the plugin
(`agents/<name>.md`, `personas/<name>/`) and is never copied here.

`send()` re-points the thread: `chat_threads.agent` is the desk,
`chat_threads.pack` is `clients/<slug>`, `products/<slug>` or `me`, and
`private` is set for the coach. The word after the name pins a pack only
when the CRM knows the slug (the `clients` or `products` table, or `me`);
otherwise it is the first word of the message. Switching desks keeps the
pack when the new desk loads the same kind (pm → client manager keeps the
client), the coach always has `me`, anything else starts unpinned and the
desk asks. The thread's title is the message without the address.

Every turn in the thread runs on the desk's ladder — `persona` (Grok 4.6
High) for most, `writing` for the copywriter, `architecture` for the
product owner — with `jobFor()` giving an address the first say, a
`/command` the second, a task the third. The claim carries
`persona: { name, label, pack }`; the worker reads
`personas/_shared/HOUSE.md`, `agents/<name>.md`, the persona's four files
and the pack's files from the Mac and inlines them, in the order `/as`
reads them, then runs with `tools: ["mcp"]` — a desk talks with the CRM
tools; a build goes through Solve in chat. The reply's speaker is the
desk's label. Same trust boundary as skill turns: without
`CHAT_WORKER_SKILLS` (and the `personas/` and `agents/` links beside it)
the turn is refused with a plain error.

`private` threads are for the coach: the `me` pack is inlined on the Mac
and never stored, but the replies are rows like any other, so the flag is
what keeps them out of any shared or portal view that ever lists threads.

### What a desk remembers

Three things, none of them a model remembering on its own.

**Feedback.** Under every desk reply: *Not right* (asks for one line on why)
and *Keep as example*. Each becomes a `chat_feedback` row carrying the desk
and pack of the thread at the time and the reply it was about. The plugin's
`/train <persona>` reads them through `GET /api/chat/feedback` and turns
them — with corrections, rejected writes and unanswered *Questions for
Karol* from `GET /api/chat/threads` — into rules and examples Karol
approves into the persona's `memory.md` / `examples.md`. Nothing in the
CRM changes a persona; the files live in the plugin.

**Digests.** When a desk thread has been quiet for twenty minutes, the
worker — with nothing to answer and nothing to land — asks
`POST /api/chat/digests` for one, writes a four-to-six-sentence digest on
Composer 2.5 (what Karol asked, what was decided or committed, what is
pending on him, what stayed open) and stores it on the thread. A thread is
digested again after every new message. The claim then carries the same
desk's last five digests on the same pack (`recent`), inlined under
*your recent threads* with the rubric that they are continuity, not
evidence — so the coach knows last week's commitment and the client
manager knows Tuesday's *Next:* on Thursday. A digest run is not a chat
turn: no ledger row, no tools, no reply; it shows only in the worker log.

**Handoffs.** `route_to` lets a desk hand the conversation to another desk
with a brief, along the org chart's edges only (pm and dreamer reach any
desk; an account desk reaches the pm; the product owner briefs developer,
designer and marketer; the marketer briefs the copywriter). Previewed like
every write; on Confirm `send()` opens a new thread addressed to that desk
— the brief as its first message, shown as from the handing desk, the
pack carried when the kinds match, `from_thread_id` pointing back — and
the desk answers there. A conversation travels with a brief; work products
never do.

### The dock

The nine desks sit on the right edge of every page (`components/chat/
DeskDock.tsx`, mounted in `AppShell`). The page decides which one is up
front and which pack it pins — `lib/chat/desk-context.ts`: a client's page
fronts the client manager on that client, a product's page the product
owner, the boards the dreamer, reports and insights the marketer, codebase
docs the developer, the dashboard the pm; the coach is never a default;
`/chat` hides the dock. A dot on a monogram means a card is parked in that
desk's threads. Opening a desk shows a panel: its latest thread on that
pack or a fresh one (Settings → Desk dock; `new thread` in the panel
forces fresh), what it remembers as *Last time* (the newest digest on that
pack), the same rows, cards and feedback the chat page renders through
`lib/chat/views.ts`, and a composer that is already addressed — `send()`
takes `desk: { agent, pack }` and pins the thread without the typed
grammar. Under 1024px the dock is a button and the panel a sheet.

### launchd keeps it up

Remembering to start the worker is the whole failure: a message queued with
nothing attached is answered in sixteen seconds or in twenty minutes depending
only on whether a terminal happened to be open. So launchd owns it —
`RunAtLoad` at login, `KeepAlive` if it dies.

```sh
cp scripts/com.tallkarol.chat-worker.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tallkarol.chat-worker.plist
```

| | |
|---|---|
| Stop | `launchctl bootout gui/$(id -u)/com.tallkarol.chat-worker` |
| Status | `launchctl print gui/$(id -u)/com.tallkarol.chat-worker \| head` |
| Log | `tail -f ~/Library/Logs/tallkarol/chat-worker.log` |

launchd reads its own copy in `~/Library/LaunchAgents`, so edits to the file in
`scripts/` do nothing until it is copied over and re-bootstrapped. The plist
carries `CRM_URL`; point it at the deployed CRM to serve that instead of dev.

A second agent, `com.tallkarol.meeting-worker` (`scripts/meeting-worker.ts`),
runs beside this one and never shares its process: a two-minute model turn
here must not delay a recording there. It heartbeats under
`app_settings.meeting_worker` through the same `worker-status.ts`, and both
use `scripts/worker-http.ts` for the token, the timeout and the beat. See
MEETING-NOTES.md.

### Telling "thinking" from "nobody is listening"

`lib/chat/worker-status.ts` keeps a heartbeat in `app_settings` under
`chat_worker`, and the chat page swaps the "Working…" dots for a plain notice
when the last beat is over twenty seconds old.

The beat runs on a **timer in the worker, not its poll loop**. A worker
running a two-minute turn polls the queue zero times, so a poll-based signal
would call it dead in the middle of the job it was doing. Nothing is lost
while it is down: the turn stays `queued` and is claimed the moment a worker
returns.

## The page

`/chat` is one frame the height of the window (AppShell's `FULL_BLEED` hands
it a flex column instead of the scrolling canvas): a rail on the left that
never scrolls away, the thread on the right, only the thread scrolling.

| Route | Shows |
|---|---|
| `/chat` | the newest thread |
| `/chat?thread=<id>` | that thread |
| `/chat?new` | an empty composer; the first line starts and names the thread |

**The rail** has two tabs. *Threads* — grouped Today / Yesterday / Earlier,
an amber "Needs you" on any thread with a write parked, an Archived group
folded at the bottom, and the month's budget under the list. Archive is the
box icon in the thread header; it stamps `archivedAt` and nothing else, so
Restore (same spot, on an archived thread) or simply sending into the
thread brings it back. Nothing is ever deleted. *Skills* — every command, skill and agent from the
committed hive-mind scan, grouped by lane; a row opens to what it is and
what to type, and each form either drops into the composer with its blank
selected or, when it needs no argument, sends. The tab is remembered per
browser.

**The thread.** Karol's messages are a bubble; replies are prose on the
canvas with the model that answered beside the name. Reads show as chips
(`peek_agent_mailbox · 6`), writes as the approval card, and the rungs a
question climbed as a footnote with cost and time. Failed reads and failed
writes stay visible as what they are.

**The composer.** Enter sends, Shift+Enter breaks a line, `/` opens the
palette over the commands. The sidebar and the empty-thread starters reach
the box through a window event (`components/chat/compose-bus.ts`), the same
idiom as the dashboard's left-off board.

Every time on the page is formatted in `Europe/Warsaw` on both sides of
hydration (`lib/chat/format.ts`): the server runs in UTC and a day heading
that moved between server and client would be a hydration error.

## What is not built yet

- **Streaming.** The page polls every three seconds while a turn is in flight.
  Adequate for work that takes tens of seconds; a stream can come later without
  changing the contract.
- **Group threads.** A thread has one desk at a time; `route_to` opens a
  new one rather than adding a second voice. A roster in the rail is a
  filter over threads that exist, not a directory.
- **Voice and attachments.** In the mockup, not in the build. The composer
  deliberately has no attach or dictate buttons until they do something.
- **Structured skill results.** A skill's picklist (inspector findings, a
  punch list) arrives as prose. A card with checkboxes needs the skill to
  return structured output the CRM can render; nothing does yet.
- **Repo work with detectors.** Task threads are the one runner that touches
  code, and they run single-rung. The `code_tested` / `debug` ladders still
  have nothing wiring a detector back — the escalation path exists and is
  tested, nothing calls it automatically.
