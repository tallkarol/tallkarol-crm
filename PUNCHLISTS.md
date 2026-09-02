# Punch lists

A punch list is a checklist an agent cut from a source — an email, a Word
document, a meeting transcript — and filed against a client (and, when it has
one, a project). It is never typed in by hand. Every item is a real task, so
ticking it on the list and finishing it on `/tasks` are the same write.

The shape follows Karol's own lists (`punch-lists/UWD Preprod Punch List.html`):
sections (`A · Answers & decisions`, `B · Code fixes`), a kind chip per item
(`theme PR`, `bundle`, `preprod script`, `held`), a **Reported** block — the
client's words, verbatim — and a **Fix** block — the diagnosis and what "done"
means. The circle at the start of a row cycles to do → doing → done.

Naming: "punch" alone means the time clock in this app (`time_punches`,
`lib/punch.ts`). Everything here is spelled `punchlist`, one word.

## Objects

| Table | What it is |
|---|---|
| `punchlists` | The list: title, slug, client (required), project/retainer, `status` draft · open · done · void, `intro`, `sourceKind` mail · doc · transcript · manual, `sourceRef`, `sourceText` (the text the items were cut from, ≤200 KB), `generatedBy`, `sessionRef`, `refKind`/`refId` (CLI idempotency). |
| `punchlist_items` | One row per item: `section`/`sectionSort`/`sort`, `title`, `kind`, `reported`, `outcome`, `taskId`, `test` (jsonb spec), `lastTestStatus`. **No done flag** — the task's `status` + `boardStage` are the item's state. |
| `punchlist_test_runs` | One request to prove one item: `status` queued · running · pass · fail · blocked · cancelled, `spec` (snapshot of the item's test at request time), `verdict`, `report` jsonb, `runner`, `sessionRef`. |
| `agent_sessions` | What a Claude Code / Cursor conversation did, keyed by its session id. Written by `session-log` in daedalus-hive-mind; stubbed by `logAgentTime()` and `createPunchlist()` when a ref arrives first. |
| `time_entry_sessions` | Which sessions a billable agent entry paid for and each one's share of the hours. |

State rules (`lib/punchlist.ts`, pure — `npm run check:punchlist`):

- `itemState(task)`: done → `done`; open + `doing` → `doing`; open + `waiting` → `waiting`; else `todo`.
- The circle's next state: todo → doing → done → todo. Waiting is only ever set from the task.
- List status: `draft` and `void` are stored; an `open` list reads `done` when every item is done and `open` again when one reopens. Nothing writes that on every tick.
- Tasks spawned from items carry `source = "punchlist"`, `refKind = "punchlist_item"`, `refId = <item id>`, the kind as a label, and Reported/Fix in the notes.

## Surfaces

- `/punchlists` — banded index (open, drafts, done, void) with progress and test counts.
- `/punchlists/[slug]` — the list. `?state=todo|doing|done` filters; `?peek=task:<id>`, `?peek=run:<id>`, `?peek=session:<ref>` open the cards.
- Client hub block and project page section list the client's / project's lists.
- Peeks: `punchlist:<slug>`, `run:<id>`, `session:<ref>` in `components/peek/PeekRouter.tsx`.
- Ledger (`/timesheet/entries`): agent rows show the sessions that earned them, each opening the session card.

## Agent doors (device token, `Authorization: Bearer …`)

| Route | Does |
|---|---|
| `POST /api/punchlists` | Create a list with its items and (unless `status: "draft"`) one task per item, in one transaction. `refKind` + `refId` replay → 200 `replayed: true`. |
| `GET /api/punchlists?client=&status=` | Summaries with progress. |
| `POST /api/punchlists/:id/items/:itemId/test` | Set or clear the item's test; `request: true` also queues a run. |
| `GET /api/punchlists/runs?status=queued&client=` | The queue the Mac polls. |
| `POST /api/punchlists/runs/:id` | `queued → running → pass \| fail \| blocked`. A second `running` claim from another runner is 409 unless `force`. |
| `GET /api/inbox/mail/:id` | One inbound mail with its body, for `punchlist ingest --mail`. |
| `POST /api/sessions` | Upsert a session summary (one object, or `sessions: []`). A non-empty summary is never overwritten by an empty one. |
| `GET /api/sessions?client=&since=&unlinked=1` | Sessions, newest first. |
| `POST /api/time/agent-log` | Unchanged contract, plus optional `sessions: [{ ref, hours, name?, surface?, startedAt?, endedAt?, rawHours? }]` which links `time_entry_sessions`. |

The producers live in `~/Work/daedalus-hive-mind`: `skills/punchlist` (`/punchlist`),
`skills/session-log` (SessionEnd hook + `log-session propose` sweep), and
`skills/log-session` (sends `sessions[]`).

## Tests on items

```jsonc
{ "kind": "browser" | "http" | "command" | "manual",
  "url": "…", "method": "GET",                 // browser | http
  "repo": "…", "command": "…",                 // command
  "steps": ["…"], "expect": "…",               // expect is required
  "evidence": ["screenshot", "console"], "timeoutSec": 120 }
```

"Request test" on an item queues a run and sends a `punchlist.test`
notification (`lib/notify.ts`). Nothing on the server runs the test: a
session on the Mac runs `/punchlist test --pending`, claims the run, hands
the spec to the `qa` agent, and posts the verdict. The cron `tick()` nudges
once an hour for three hours if a run stays queued. An unattended poller was
designed and deliberately not wired — see `skills/punchlist/SKILL.md`.

## Decisions (Sep 2, 2026)

- Approve in chat, then create: the CLI's `submit` lands the list `open` with
  tasks made. Server-made lists (a future inbox verb) land as `draft`.
- Tests run on demand only.
- Every client-pinned session is summarized at SessionEnd and pushed. Only
  the model-written summary leaves the Mac; the summary is a draft Karol
  edits at `log-session propose`.
- A failed test renders red and reopens nothing by itself.
