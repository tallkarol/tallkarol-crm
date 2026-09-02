/**
 * Scaffold hub content. One entry per project type: the preferred stack,
 * the repeatable moves, and the commands worth remembering. Grown by
 * distilling real projects — add a new Scaffold object per project type.
 */

export type StackRow = {
  layer: string
  choice: string
  notes: string
}

export type PlaybookSection = {
  title: string
  steps: readonly string[]
}

export type CommandRow = {
  cmd: string
  what: string
}

export type Scaffold = {
  slug: string
  name: string
  kind: string
  summary: string
  /** The reference project this scaffold was distilled from. */
  source: string
  stack: readonly StackRow[]
  commands: readonly CommandRow[]
  playbook: readonly PlaybookSection[]
}

export const SCAFFOLDS: readonly Scaffold[] = [
  {
    slug: "tk-crm",
    name: "tk-crm",
    kind: "Next.js custom CRM",
    summary:
      "Internal tool / CRM stack: Next.js App Router with a Postgres + Drizzle data layer, server actions per route, and a scripts/ folder of tsx CLIs for every integration and cron job.",
    source: "tallkarol/crm",
    stack: [
      {
        layer: "Framework",
        choice: "Next.js 14 (App Router) · React 18 · TypeScript",
        notes:
          "Route groups split surfaces: (admin) behind auth, /portal for clients, /doc for printable docs.",
      },
      {
        layer: "Database",
        choice: "Postgres · Drizzle ORM · drizzle-kit",
        notes:
          "Schema in db/schema.ts, relational queries via db.query.*, migrations generated then applied with tsx db/migrate.ts.",
      },
      {
        layer: "Styling",
        choice: "Tailwind CSS 3 · lucide-react",
        notes:
          "Brand tokens as tk-* colours in tailwind.config.ts (tk-onyx, tk-slate, tk-teal, tk-linen). Cards are rounded-2xl white on linen.",
      },
      {
        layer: "Auth",
        choice: "Custom sessions (lib/auth)",
        notes:
          "getSessionUser() in the (admin) layout, redirect to /login when absent. No auth library.",
      },
      {
        layer: "Validation",
        choice: "zod",
        notes: "Parse at the edges: server actions, API routes, webhook payloads.",
      },
      {
        layer: "Email",
        choice: "Resend",
        notes: "Transactional sends plus engagement tracking (MAIL.md).",
      },
      {
        layer: "Charts / DnD",
        choice: "Recharts · @dnd-kit/core",
        notes: "Recharts for insights pages, dnd-kit for pipeline boards.",
      },
      {
        layer: "AI",
        choice: "@anthropic-ai/sdk",
        notes: "Notebook scanning and insight generation.",
      },
      {
        layer: "Jobs & CLIs",
        choice: "tsx scripts/ + npm aliases",
        notes:
          "Every integration gets a script (notion.ts, wire.ts, inbox.ts) exposed as namespaced npm scripts (notion:sync, wire:rotate). Scheduled work funnels through cron:tick.",
      },
      {
        layer: "Deploy",
        choice: "Railway",
        notes: "railway.json in repo; Postgres lives alongside. See DEPLOY.md.",
      },
    ],
    commands: [
      { cmd: "npm run dev", what: "Dev server on port 3001" },
      { cmd: "npm run db:generate", what: "Generate Drizzle migration from schema diff" },
      { cmd: "npm run db:migrate", what: "Apply migrations (tsx db/migrate.ts)" },
      { cmd: "npm run db:studio", what: "Browse the database in Drizzle Studio" },
      { cmd: "npm run cron:tick", what: "Run the scheduled-work sweep once" },
    ],
    playbook: [
      {
        title: "Add a page",
        steps: [
          "Add the path to ROUTES in lib/nav.ts and a NavLink in the right section (plus an icon name).",
          "Map the icon name to a lucide icon in lib/nav-icons.ts.",
          "Create app/(admin)/<route>/page.tsx starting with <PageHeader title=…> — export metadata and, if it reads the db, dynamic = \"force-dynamic\".",
          "Mutations live in a sibling actions.ts as server actions.",
        ],
      },
      {
        title: "Add a table",
        steps: [
          "Define it in db/schema.ts (plus relations).",
          "npm run db:generate, review the SQL in drizzle/, then npm run db:migrate.",
          "Query with db.query.<table>.findMany({ with: … }) — prefer relational queries over joins.",
        ],
      },
      {
        title: "Add an integration",
        steps: [
          "Secrets go in .env.local (and the Vault page for shared credentials).",
          "Write scripts/<name>.ts with link/list/sync subcommands; wire npm aliases <name>:link etc.",
          "Inbound webhooks get an app/api/<name> route with a token check.",
          "Recurring syncs register with the cron:tick sweep instead of their own scheduler.",
        ],
      },
    ],
  },
  {
    slug: "mlfrontend",
    name: "mlfrontend",
    kind: "Next.js website",
    summary:
      "Marketing / brand website stack: latest Next.js and React with Tailwind 4, GSAP + Lenis for motion, Radix primitives for interactive bits, and Prisma over Postgres for the light data layer.",
    source: "mineralife-frontend",
    stack: [
      {
        layer: "Framework",
        choice: "Next.js 16 · React 19 · TypeScript",
        notes:
          "Server components by default; client components only where motion or interaction needs them.",
      },
      {
        layer: "Styling",
        choice: "Tailwind CSS 4 (@tailwindcss/postcss)",
        notes:
          "clsx + tailwind-merge for composition, @tailwindcss/typography for long-form content, next-themes for theming.",
      },
      {
        layer: "Motion",
        choice: "GSAP + @gsap/react · motion · Lenis",
        notes:
          "useGSAP() for entrance/scroll timelines, Lenis for smooth scrolling, motion for smaller component-level transitions.",
      },
      {
        layer: "UI primitives",
        choice: "Radix UI · lucide-react",
        notes: "Radix dialog/accordion for accessible interactive pieces; no component kit.",
      },
      {
        layer: "Database",
        choice: "Prisma 6 · Postgres",
        notes:
          "prisma generate runs on postinstall and in the build script so deploys never ship a stale client.",
      },
      {
        layer: "Email",
        choice: "Resend",
        notes: "Contact / inquiry form delivery.",
      },
      {
        layer: "Content & docs",
        choice: "sanitize-html · react-pdf · react-pageflip",
        notes:
          "sanitize-html for anything imported from the legacy site; react-pdf + pageflip for catalog viewing.",
      },
      {
        layer: "Migration tooling",
        choice: "ssh2-sftp-client · node --experimental-strip-types scripts",
        notes:
          "validate:migration / smoke:migration scripts check legacy-content imports before switchover.",
      },
      {
        layer: "Hosting & analytics",
        choice: "Vercel · @vercel/analytics",
        notes: "Zero-config deploys; analytics component in the root layout.",
      },
    ],
    commands: [
      { cmd: "npm run dev", what: "Dev server" },
      { cmd: "npm run typecheck", what: "tsc --noEmit — run before committing" },
      { cmd: "npm run db:push", what: "Push schema to the local/public database (dotenv wrapped)" },
      { cmd: "npm run db:migrate", what: "prisma migrate deploy against PUBLIC_DATABASE_URL" },
      { cmd: "npm run validate:migration", what: "Validate legacy-content migration" },
    ],
    playbook: [
      {
        title: "Add a page / section",
        steps: [
          "Build the section as a server component; split out a client component only for the animated part.",
          "Entrance animations via useGSAP() with scoped selectors — keep timelines inside the component that owns the DOM.",
          "Long-form content gets the prose classes from @tailwindcss/typography.",
        ],
      },
      {
        title: "Change the schema",
        steps: [
          "Edit prisma/schema.prisma, then npm run db:push while iterating locally.",
          "Cut a real migration for production and deploy it with npm run db:migrate.",
          "The db scripts read .env.local via dotenv-cli and prefer PUBLIC_DATABASE_URL when set.",
        ],
      },
      {
        title: "Ship",
        steps: [
          "npm run typecheck and npm run lint must pass — the build also runs prisma generate, so schema drift fails fast.",
          "Push to main; Vercel builds and deploys.",
        ],
      },
    ],
  },
]

export function findScaffold(slug: string): Scaffold | undefined {
  return SCAFFOLDS.find((s) => s.slug === slug)
}
