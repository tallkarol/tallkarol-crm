import type { LeadListItem } from "@/lib/lead"

export type OutreachKind = "email" | "onesheet"

export type OutreachTemplate = {
  id: string
  kind: OutreachKind
  title: string
  blurb: string
  subject: string
  body: string
}

export const EMAIL_TEMPLATES: OutreachTemplate[] = [
  {
    id: "thanks",
    kind: "email",
    title: "Thanks, I have it",
    blurb: "Same-day acknowledgement. Buys a day to actually read the form.",
    subject: "Thanks — I have your note",
    body: `Hi {{firstName}},

Thanks for writing in{{companyPhrase}}. I have what you sent{{projectPhrase}} and I'll come back within a business day with a clear next step.

If something is time-sensitive, reply to this and say so.

Karol
Tall Karol`,
  },
  {
    id: "questions",
    kind: "email",
    title: "A couple of questions",
    blurb: "Qualify without a call. Use when the form left a gap.",
    subject: "A couple of questions before we talk",
    body: `Hi {{firstName}},

I read through what you sent{{projectPhrase}}. Before I put time on the calendar, I want to make sure I'm the right person.

1. What has to be true in 90 days for this to have been worth it?
2. Who else is in the room when a decision gets made?
3. Is there a date this needs to move by, or is that still open?

A few sentences is enough. If it's easier to talk it through, say so and I'll send times.

Karol
Tall Karol`,
  },
  {
    id: "meeting",
    kind: "email",
    title: "Time to talk",
    blurb: "Send once a meeting is on the board — or to propose one.",
    subject: "Time to talk",
    body: `Hi {{firstName}},

I'd like to talk this through{{projectPhrase}}.{{meetingBlock}}

Thirty minutes is enough. Come with the thing that's actually stuck — I'll come with how I'd approach it.

Karol
Tall Karol`,
  },
  {
    id: "pass",
    kind: "email",
    title: "Not the right fit",
    blurb: "A clean no. Short, specific, no fake referrals.",
    subject: "Not the right fit right now",
    body: `Hi {{firstName}},

Thank you for sending this over. I don't think I'm the right person for it{{projectPhrase}} — I'd rather say that now than waste a call.

If that changes later, or the brief gets more specific, write again.

Karol
Tall Karol`,
  },
]

export const ONESHEET_TEMPLATES: OutreachTemplate[] = [
  {
    id: "studio",
    kind: "onesheet",
    title: "Studio one-sheet",
    blurb: "Who I am, how work starts, what a first month looks like.",
    subject: "How I work — Tall Karol",
    body: `Hi {{firstName}},

You asked how this actually works. Here's the short version.

Tall Karol is me. I design and build the sites, tools, and systems companies run on — then I stay close enough that they don't rot.

How it starts
A form or a call. I read what you sent, I say whether I'm the right person, and if I am we pick a model: a scoped project or a monthly retainer.

What you get
One throat to choke. Strategy, design, engineering, and the unglamorous integrations in between. I write like a person and I ship like a studio.

What I don't do
Retainers I can't staff. Mystery roadmaps. "We'll circle back." If it's not a fit I say so.

If you want to go further, reply with a time that works or answer the questions I already asked.

Karol
Tall Karol
tallkarol.com`,
  },
  {
    id: "project",
    kind: "onesheet",
    title: "Project one-sheet",
    blurb: "Scoped builds — site, product, or the thing in between.",
    subject: "A project with Tall Karol",
    body: `Hi {{firstName}},

For a project, I work to a written scope — not an open tab.

What a project is
A defined outcome. A site, a tool, a rebuild, a design system that someone can actually use. We agree what "done" means before I start.

How it runs
Kickoff, then weekly movement you can see. I don't vanish into a Figma file for six weeks. You get the thing, the reasoning, and enough documentation that you're not stuck with me forever — though most people stay.

Money
A fixed fee against a clear brief. If the brief moves, the fee moves, and I say that out loud.

{{projectLine}}If that matches what you had in mind, I'll send a one-page scope.

Karol
Tall Karol`,
  },
  {
    id: "retainer",
    kind: "onesheet",
    title: "Retainer one-sheet",
    blurb: "Ongoing, senior, in the Slack — not a ticket queue.",
    subject: "A retainer with Tall Karol",
    body: `Hi {{firstName}},

A retainer is for when the work isn't one project — it's the next twelve months of "can you look at this."

What it is
A reserved slice of my week. Design, engineering, integrations, the odd fire. You get someone who already knows the stack, not a new agency every quarter.

What it isn't
A body shop. I don't staff a bench. If you need a team of six, I'll tell you — and I probably won't be the hire.

How it feels
I'm in your Slack. I answer. I push back when the request is the wrong request. You stop writing briefs for people who don't have context.

If that's the relationship you want, I'll send a simple monthly agreement.

Karol
Tall Karol`,
  },
]

export const ALL_TEMPLATES = [...EMAIL_TEMPLATES, ...ONESHEET_TEMPLATES]

export function templateById(id: string): OutreachTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id)
}

function companyPhrase(lead: LeadListItem): string {
  return lead.company ? ` from ${lead.company}` : ""
}

function projectPhrase(lead: LeadListItem): string {
  if (lead.projectTypes.length > 0) {
    return ` about the ${lead.projectTypes.join(" / ")} work`
  }
  if (lead.engagement) return ` about a ${lead.engagement.toLowerCase()}`
  return ""
}

function projectLine(lead: LeadListItem): string {
  if (lead.projectTypes.length === 0 && !lead.engagement) return ""
  const what =
    lead.projectTypes.length > 0
      ? lead.projectTypes.join(" / ")
      : lead.engagement
  return `From the form, this looks like ${what}. `
}

function meetingBlock(lead: LeadListItem): string {
  if (!lead.lead.meetingAt) {
    return "\n\nReply with two or three times that work this week — 30 minutes, your timezone."
  }
  const when = new Date(lead.lead.meetingAt)
  const formatted = when.toLocaleString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  const note = lead.lead.meetingNotes.trim()
  return `\n\nI have ${formatted} on the calendar${note ? ` (${note})` : ""}. If that no longer works, say so and I'll move it.`
}

export function renderTemplate(
  template: OutreachTemplate,
  lead: LeadListItem
): { subject: string; body: string } {
  const replace = (text: string) =>
    text
      .replaceAll("{{firstName}}", lead.firstName)
      .replaceAll("{{companyPhrase}}", companyPhrase(lead))
      .replaceAll("{{projectPhrase}}", projectPhrase(lead))
      .replaceAll("{{projectLine}}", projectLine(lead))
      .replaceAll("{{meetingBlock}}", meetingBlock(lead))
      .replace(/\n{3,}/g, "\n\n")
      .trim()

  return {
    subject: replace(template.subject),
    body: replace(template.body),
  }
}
