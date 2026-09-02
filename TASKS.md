# Tasks

One hub, five ways in, and a task that can finally name the thing it is about.

## The three units of work

| Object | Table | What it is |
| --- | --- | --- |
| **Deliverable** | `deliverables` | A billable line on a project — fee, due date, invoice state. What the client bought. |
| **Workstream** | `workstreams` | A swimlane on the delivery board. How work is grouped for the client's eye. |
| **Task** | `tasks` | A unit of *your* work. Hangs off a client, project, retainer, or a specific deliverable. |

A task always names a client, and picking a project fills its client in — the
same rule a punch follows, so the two surfaces cannot drift apart.

## Capture

Five doors, all writing through `createTask()` in `lib/task-actions.ts`:

1. **The composer** (`components/tasks/TaskComposer.tsx`) — mounted on the hub.
2. **An add row on every entity** — project, retainer and client pages mount the
   same component with a `scope`, so "add a task here" needs no picker.
3. **The grammar**, parsed live with chips shown before anything saves.
4. **`ref_kind` / `ref_id`** carry where a task came from (ticket, meeting,
   invoice) for the trail.
5. **`POST /api/tasks`** on the device token the clock already uses.

### Grammar

| Token | Means | Accepts |
| --- | --- | --- |
| `@` | Client or project; a project fills in its client | `@gdi`, `@caps fieldhouse website` — longest match, anywhere in the line |
| `!` | Due date | `!today` `!fri` `!3d` `!2w` `!eom` `!31aug` `!2026-10-05` |
| `*` | Repeats | `*weekly` `*monthly` `*quarterly` |
| `>` | Snooze — hide until, without faking a deadline | `>mon` `>1w` |

Anything a sigil cannot resolve stays in the title and is reported as a chip.
The old parser matched one word, at the end of the line only, and swallowed it.

```bash
curl -X POST https://crm.tallkarol.com/api/tasks \
  -H "Authorization: Bearer $TK_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"chase hero images @caps fieldhouse website !fri"}'
```

Structured calls may also send `notes`, `priority` (1–3), `labels` (up to
ten strings), and `refKind` + `refId` (a uuid) naming what the task was made
from. The same `refKind`/`refId` pair sent twice returns the task already made
with `200` and `replayed: true` — the `/follow-up` skill in daedalus-hive-mind
relies on that so a retried submit never files a twin.

## The hub

`/tasks` is one 44px bar over a banded list.

- **The lens** is the leftmost control — a saved view, naming the question the
  list answers. Defaults seed on first open: Needs me today (the default),
  Overdue, Waiting on client, Delivery board, Repeating, All tasks, Archive,
  plus one per live client.
- **Filters state what they are doing while closed** — `Clients` when off,
  teal and `GDI +1` with a count when on.
- **The second line only exists when a filter is applied**: removable pills,
  Clear all, `N of M tasks`, and Save-to-this-view when the bar has drifted.
- **`⋯`** holds group and sort. **Layout** (list / board / week) sits at the right.
- Every control writes to the URL, so a view is a link.

Rows are **banded by a run of whatever the list is sorted by** — sorted by due
you get an overdue block, then dated, then undated; sorted by priority you get
the high block. A band is therefore always a true statement, unlike
every-other-row striping. Turning grouping on names the runs and pins the
header while you scroll it.

Cards are used where a card is a draggable object — the board and week layouts —
not for the list, where they cost about a third of the visible rows.

## The detail

`components/tasks/TaskDetail.tsx` renders both the peek (`?peek=task:<id>`) and
the full page (`/tasks/[id]`). It carries what the old peek could not set at
all: **client, project, retainer and deliverable pickers**, stage, priority,
due, snooze, repeat, a checklist, notes, and a trail with the repeat history.

## Rules

- **Priority** is 1 high · 2 normal · 3 low. The dot only fills for high.
- **Labels** (`labels text[]`) say what a row is besides plain work — "feature
  request", "change request" — plus commercial flags like "covered under
  warranty". Same free-array contract as `support_tickets.tags`; rendered as
  chips on rows and the detail. Bugs are never labeled tasks — they open a
  ticket instead.
- **Snooze is separate from due.** `snoozed_until` hides a task without touching
  `due_on`, because a faked deadline is how "overdue" stops meaning anything.
- **`completed_at` is its own column.** `updated_at` used to carry it, so
  "done today" really meant "edited today", and editing an old note dragged a
  finished task back into today's list.
- **Recurrence lives in `reopenDueRecurring()`** and nowhere else. It compares
  real completion dates against the period each cadence means — weekly against
  the ISO week, monthly against the month, quarterly against the quarter. The
  old logic compared `updated_at` to the first of the month for every cadence,
  so a weekly task ticked off on the 5th stayed done until the 1st.
- **Repeat history**: completing a repeating task writes a `task_completions`
  row keyed on its period (`2026-W36`, `2026-09`, `2026-Q3`), unique per task
  and period. The task itself just reopens; the history is what proves August's
  maintenance happened.
- **Waiting rots**: a task in `waiting` for seven days or more earns a line on
  the dashboard's attention list, with its age.
- **Renewal tasks** match on `(source, ref_kind, ref_id, due_on)` rather than an
  exact title, so renaming one no longer spawns a twin on the next page load.

## Not built, on purpose

**Deliverables do not spawn tasks yet.** The `tasks.deliverable_id` link exists
and is settable, so a task can be filed against a specific billable line — but
nothing auto-creates "Build D3" / "Invoice D3". Karol's call: the shape of
those tasks, and how subtasks fit, is not settled yet. Revisit once the hub has
been lived in.

## Checks

```bash
npm run check:tasks   # grammar, dates, longest-match targets, period maths
```
