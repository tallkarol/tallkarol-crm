# Client hub

`/clients/[slug]` is one client's workspace: a set of **rooms** under one
layout, with the dock's panel switched into **client mode** while you are
inside. Signed off by Karol on 23 Sep 2026 from the local mockup
`~/Work/tallkarol/crm-hub-b-rooms.html` (source in `hub-mockup-src/`), after the
old single-page hub (12 stacked sections, 5 KPIs, a 6-card rail) was measured
as a doorway nobody worked in.

## Rooms

| Route | Room | What it holds |
| --- | --- | --- |
| `/clients/[slug]` | **Board** (landing) | Focus + queue · This week (today, tomorrow, rest of the week) beside Signals · the horizon columns |
| `/clients/[slug]/calendar` | Calendar | The whole week, this client emphasised, deadline rows |
| `/clients/[slug]/inbox` | Inbox | The inbox union scoped to the client, plus agent approvals and meeting-note proposals |
| `/clients/[slug]/monitors` | Monitors | One accordion row per system the client has running |
| `/clients/[slug]/dashboards` | Dashboards | Tabs: Projects & Docs · Retainer & Money · Insights · Paid Ads |

Room loaders live beside the shared ones: `lib/client-rooms.ts` (shell, panel,
week, signals), `lib/client-inbox.ts`, `lib/client-monitors.ts`,
`lib/client-calendar.ts` (pure hour maths). Room components:
`components/clients/{BoardRoom,HorizonBoard,WeekStrip,SignalsCard,WeekGrid,
NowLine,InboxRoom,InboxTriageBar,SystemsAccordion}.tsx`; the Dashboards room is
the old hub page reorganised into `?tab=` panels in
`app/(admin)/clients/[slug]/dashboards/page.tsx`.

`app/(admin)/clients/[slug]/layout.tsx` owns the header (avatar, name, status
menu, Timesheet, Insights, Ask the desk), mounts the panel, and docks the
**focus strip** under every room except the Board. The rooms are full-bleed
(`AppShell` treats `clientSlugOf(pathname)` like `/chat`), so each room scrolls
on its own.

## The panel on the roster

`/clients` swaps the group panel for the client list itself
(`components/clients/ClientsPanel.tsx`, grouped by `lib/client-groups.ts`):
**Active retainer** (an active retainer), **Active project** (no retainer, a
project not complete), **Completed** (everything else — finished, in contact,
lapsed), **Internal** (status `internal`). A row carries the client's colour
dot and, when true, a red dot (tickets past their reply window) and an amber
dot (overdue tasks). Nothing else is in that panel; the group's other pages
(Insights, Reports, Proposals, …) stay reachable from their own routes and ⌘K.

The page itself is the across-clients desk, not a launcher, and has no page
title: **Focus** (the global set, `GlobalFocus … always`, so the empty slots
show when nothing is pinned; "New client" sits in its header row beside the
3 | 1 switch, both 30px), then two equal columns — **This week** (`WeekAgenda`
with its headline above the card like Signals, ‹ Today › as plain text links on `/clients?week=`,
every client's event in that client's colour, deadlines and month-ends for all
of them; `loadWeekAll()`) beside **Signals** across every client, each row
carrying its client's dot and name (`loadSignalsAll()`, 14 lines then "+n more
in the inbox" → `/inbox`). No calendar grid here — the grid lives in a
client's Calendar room.

## The panel in client mode

`components/clients/ClientPanel.tsx`, put into the dock through
`components/nav/PanelSlot.tsx`: the client layout's `ClientPanelMount` sets an
override on mount and clears it on unmount, and `AppShell` renders the
override instead of the group's `HubPanel`. Nothing about the dock's six groups
changes. Contents, top to bottom: the **switcher** (every client, hot/warn dots,
⌘⇧C), the **clock card** (`startPunch({ clientId, switchRunning: true })` /
`stopPunch`, reading `useRunningClock()` — no second poll), the **rooms** with
badges (Board = open tasks, Inbox = needs-you, Monitors = failing), **Portal**
(`GET /api/portal/preview?client=` sets the same preview cookie Settings →
Client Portals uses and lands on `/portal` in a new tab), the **Client manager**
desk (dispatches `DESK_OPEN_EVENT`; `DeskDock` listens and opens the route's
default desk), **All clients**, and the **Monitors** dot list — one status dot
and a name per site/job, nothing else; the numbers live in the room.

## Focus

The post-its. One table, `focus_items` (migration 0062):

| column | meaning |
| --- | --- |
| `client_id` | the set the row belongs to |
| `ref_kind`, `ref_id` | `task` · `ticket` · `deliverable` · `mail` and the record's uuid |
| `position` | 0..n-1 within the client. **Positions 0–2 are the showing slots** (0 alone in 1-mode); the rest is the queue in order |
| `global` | elevated to the dashboard's set. The row stays on the client, so global ⊆ client sets by construction |
| `color` | paper override (`task` `ticket` `deliverable` `punch` `note` `money`); null = the kind's own |

Rules, all in the PURE `lib/focus.ts` (`npm run check:focus`):

- **3 or 1 is a view setting**, cookie `tk_focus_mode`, never data. Switching
  moves nothing; 1-mode shows position 0 and lists 1.. at the head of the queue.
- `placeInOrder(order, id, target, mode)` is the one placement rule — a drop on
  slot *i*, on the queue, before a queue note, or "front". Overflow past the
  showing window pushes the last slot into the queue. Actions re-read the
  order, apply it, and write positions back (`focus-actions.ts`), so two quick
  drops cannot leave a gap.
- **✓ completes the record** (task → done via `setTaskDone`, ticket → closed
  via `setTicketState`, deliverable → done, mail → archived) and deletes the
  row; the next queued card moves up because positions are relative.
- **Rows heal on read**: `focusFor()` prunes a row whose record is gone or
  finished elsewhere, so a task completed on /tasks leaves the Board on the
  next load.
- Paper colour follows the kind (`paperFor`), punch-list tasks are green, mail
  is violet. Tokens `--paper-*` live in `globals.css` in both themes; the ink on
  paper never inverts. The pushpin means global; the client-colour flag says
  whose it is on the dashboard.
- **Takeover** (⤢ in the tray header, `?focus=full`, Esc back) is a fixed
  overlay in `components/focus/Takeover.tsx`, not a route: only the cards,
  larger, the clock chip and the 3|1 switch.

The dashboard renders the global set with `components/focus/GlobalFocus.tsx`
(`globalFocus()` in `focus-data.ts`); each card links back to its Board.

## The horizon board

`lib/horizon.ts` (pure, covered by `check:focus`) bands a client's tasks by
time, not by a hand-set stage — the old `board_stage` had every task in Queue:

| column | rule |
| --- | --- |
| This week | `due_on` ≤ this Sunday, overdue included (overdue first) |
| Later | no date, or after Sunday |
| Waiting | stage `waiting`, or snoozed past today |
| Done | completed in the last 7 days |

A **drop writes the column's meaning** (`moveTaskHorizonAction`): into This
week sets Sunday when the task has no date inside the week, into Later clears
the date, into Waiting parks it (stage), into Done completes. Leaving Waiting
or Done un-parks/reopens first. A post-it dropped into a column leaves focus
and takes the column's rule (`deferFocusAction`). Focused tasks are hidden
from the columns (`bandBoard(tasks, today, focusedTaskIds)`).

`components/clients/BoardRoom.tsx` is the one `DndContext` over the tray and
the columns. It keeps a local copy of the server's data, applies the pure rule
on drop, fires the action, then `router.refresh()`.

## Signals and the week

`lib/client-rooms.ts`: `loadSignals()` = inbox items for the client with
`needsReply`, late ones first (`ticketReplyDays` by priority), plus parked
agent approvals (`approvalFacts()`) and meeting-note proposals; `loadWeek()` =
every calendar event of the week with `mine` set from `calendar_events.client_id`,
plus deadline rows (deliverables and tasks due, retainer month-end with the
unused hours). The Board shows three day cards and five Signals lines; the
Calendar and Inbox rooms hold the rest. `loadWeekAll()` / `loadSignalsAll()`
are the same shapes across every client (events carry `color`, signal rows
carry `client`) and feed the roster page.

## Checks

    npm run check:focus     # pure: window, placement, labels, paper, horizon bands
    npm run check:theme     # no literal hex in .tsx, no alpha on locked tokens (prebuild)

Verify a change headless against a private build: `NEXT_DIST_DIR=.next-hub
npm run build`, `NEXT_DIST_DIR=.next-hub npx next start -p 3141`, then the
temp-session CDP recipe (`crm-headless-verify` memory); the Board's drag test
presses on the card body, not the title link (the link stops pointer events so
a click can open the peek).
