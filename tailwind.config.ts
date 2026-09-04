import type { Config } from "tailwindcss"

/**
 * Colour is routed through the appearance tokens in app/globals.css.
 *
 * The brand hexes stay available under their old names for the places that
 * mean the literal colour (a teal button, linen text on it). The mapping
 * below is per channel on purpose: `bg-white` means "the card surface" and
 * follows the theme, while `text-white` on a teal button stays white. Same
 * for `text-tk-slate` (body ink, follows the theme) versus `bg-tk-slate`
 * (now the hairline — see backgroundColor). This is what gives every existing
 * page dark mode without touching it.
 *
 * TWO VALUE SHAPES, AND THE DIFFERENCE IS THE POINT:
 *
 *   rgb(...)  — an alpha-capable triplet. `border-tk-slate/15` works. Used for
 *               the LEGACY aliases, which still carry alphas at ~800 call
 *               sites and must keep working until the sweep retires them.
 *
 *   var(--x)  — a pre-composed colour with the alpha already baked in.
 *               `border-line/50` DOES NOT COMPILE: Tailwind 3.4's
 *               withAlphaValue() calls parseColor(), parseColor("var(--line)")
 *               returns null, and the candidate is DROPPED — no CSS, no build
 *               error. That is not a bug we tolerate, it is the enforcement
 *               mechanism for mockup rule 1. Because the failure is silent,
 *               scripts/check-theme.ts owns the matching grep and it is fatal.
 */
const rgb = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    // lib/ returns Tailwind class strings from four plain Record<Tone,string>
    // maps (inbox.ts, support.ts, work.ts, app-health.ts) and has never been
    // scanned. Adding it newly GENERATES three classes that render with no
    // fill today — see the light delta.
    "./lib/**/*.ts",
  ],
  // The theme is a tk_theme cookie plus a [data-theme] stamp, not the OS. There
  // are zero `dark:` utilities today; this makes the first one anyone writes
  // agree with the tokens instead of following prefers-color-scheme alone.
  darkMode: [
    "variant",
    [
      '@media (prefers-color-scheme: dark) { &:where(:not([data-theme="light"]) *) }',
      '&:where([data-theme="dark"] *)',
    ],
  ],
  theme: {
    extend: {
      colors: {
        /* Brand literals. LOCKED. These are what make bg-tk-onyx stay onyx in
           both themes (the payload block, CopyButton, the rail) and a teal
           button teal. Never tokenise. */
        "tk-teal": "#006965",
        "tk-tomato": "#B72A0F",
        "tk-linen": "#F1EADC",
        "tk-slate": "#1F2C2B",
        "tk-onyx": "#0F1615",

        /* Three surfaces at 100%, never alpha-faded. In dark the well is
           LIGHTER than the card: #1E2928 on #172020 = 1.11:1. */
        canvas: rgb("canvas"),
        card: rgb("card"),
        well: rgb("well"),

        /* THE LINE, at two weights. Composed vars, so no alpha modifier is
           representable. Setting these in `colors` locks EVERY channel at once
           (bg/text/border/ring/divide/outline/fill/stroke); the explicit
           per-channel entries below are belt-and-braces so re-adding an
           alpha-capable colors.line later cannot quietly unlock one. */
        line: "var(--line)",
        "line-strong": "var(--line-strong)",

        /* Ink, three steps. On the card: 18.33 / 7.37 / 5.48 light,
           13.88 / 9.38 / 6.16 dark. All three clear 4.5:1 on card, well and
           canvas in both themes. */
        ink: rgb("ink"),
        "ink-2": rgb("ink-2"),
        "ink-3": rgb("ink-3"),

        /* accent = the button FILL (carries linen at 4.565:1 in dark).
           accent-ink = the accent as a mark or a line.
           accent-mark = a solid accent fill with NO label on it, which owes
           3:1 not 4.5:1 and therefore keeps the old #0E8A84 in dark. */
        accent: rgb("accent"),
        "accent-ink": rgb("accent-ink"),
        "accent-mark": rgb("accent-mark"),
        "on-accent": rgb("on-accent"),

        /* FOUR tones, not three. `good` is green, `ok` is teal, and
           components/clients/StatusPill.tsx documents why they must not fold.
             bad   light #A62228 7.29 | dark #F08A7D 6.83  (on card)
             warn  light #8A5A05 5.92 | dark #E4C07A 9.59
             ok    light #006965 6.55 | dark #4FC9BE 8.25   <- TEAL
             good  light #1B6B3A 6.54 | dark #7FD6A5 9.55   <- GREEN */
        bad: rgb("bad"),
        warn: rgb("warn"),
        ok: rgb("ok"),
        good: rgb("good"),

        /* ONE soft rung per tone (mockup rule 3). Composed vars, so the six
           ad-hoc warn alphas (.05 .055 .06 .07 .10 .12) and three bad alphas
           (.07 .10 .11) collapse to one. accent-soft derives from
           --accent-INK, not --accent: from --accent it is 1.17:1 in dark
           (the dark accent is itself dark), from --accent-ink 1.33:1 with
           6.22:1 ink on top. */
        "bad-soft": "var(--bad-soft)",
        "warn-soft": "var(--warn-soft)",
        "ok-soft": "var(--ok-soft)",
        "good-soft": "var(--good-soft)",
        "accent-soft": "var(--accent-soft)",

        /* Rail. Onyx in BOTH themes; no dark counterpart exists or should. */
        rail: rgb("rail"),
        "rail-2": rgb("rail-2"),
        "rail-ink": rgb("rail-ink"),
        "rail-ink-2": "var(--rail-ink-2)",
        "rail-ink-3": "var(--rail-ink-3)",
        "rail-line": "var(--rail-line)",
        "rail-hover": "var(--rail-hover)",

        /* Chart ink. Tailwind v3's `fill` and `stroke` core plugins both
           default to theme('colors'), so fill-chart-* / stroke-chart-* /
           fill-ink / stroke-line come free with no extra key. That is also
           why `fill-tk-teal` resolves to the literal brand hex — see the
           comment at HivemindGraph.tsx:619-622, which is correct. */
        "chart-teal": "var(--chart-teal)",
        "chart-amber": "var(--chart-amber)",
        "chart-ink": "var(--chart-ink)",
        "chart-host": "var(--chart-host)",
        "chart-cash": "var(--chart-cash)",
        "chart-prev": "var(--chart-prev)",
        "chart-axis": "var(--chart-axis)",
        "chart-good": "var(--chart-good)",
        "chart-bad": "var(--chart-bad)",
        "chart-grid": "var(--chart-grid)",
        "chart-halo": "var(--chart-halo)",
        "chart-track": "var(--chart-track)",
      },

      backgroundColor: {
        /* KEEP mapped. 357 solid bg-white sites are the card surface; only 3
           mean literal white on an always-dark surface, and those are
           hand-edited in Stage 4 to bg-on-accent/N. */
        white: rgb("card"),
        "tk-linen": rgb("well"),
        "tk-teal": rgb("accent"),

        /* NEW. tk-slate #1F2C2B IS rgb(31 44 43), which IS --line-rgb in
           light — so this is a BYTE-IDENTICAL no-op in light at all 54 sites
           and fixes all 54 in dark, where they currently fall through to the
           literal brand hex: on the dark WELL every rung at or below /15
           composites to exactly #1E2928, contrast 1.0000. Every meter track,
           list divider and timeline spine in the app is invisible in dark.
           A SAFETY NET, not the destination — Stage 4 classifies each site by
           role. Verified: there is no bare `bg-tk-slate`, so nothing loses a
           fill. */
        "tk-slate": rgb("line"),

        /* NOT MAPPED, deliberately: tk-onyx (the payload block, CopyButton and
           the code/pre surfaces, decreed literal in both themes) and
           tk-tomato (the rail badge). */

        /* The scrim, which today does not exist in dark AT ALL: all 8 overlays
           use bg-tk-onyx/NN, tk-onyx is #0F1615, and the dark canvas is ALSO
           #0F1615, so every scrim composites to exactly 1.0000:1. Six survive
           on backdrop-blur; AppShell.tsx:182 (mobile nav) and
           TemplatePreview.tsx:53 (template preview) have no blur and are
           fully transparent. Zero bg-black/N sites exist, so one token covers
           all eight. */
        scrim: "var(--scrim)",

        /* Two rungs fold onto the single soft rung. */
        "amber-50": "var(--warn-soft)",
        "amber-100": "var(--warn-soft)",
        "red-50": "var(--bad-soft)",
        "emerald-50": "var(--good-soft)",
        "emerald-100": "var(--good-soft)",

        /* NEW. 27 sites where the chip FILL stayed a literal palette hex while
           its already-mapped INK flipped. At /10 on the dark card:
           amber-700 #27251E 1.084 -> #2C3029 1.24; red-700 #272020 1.039 ->
           #2D2B29 1.18; emerald-800 #152624 1.056 -> #21322D 1.23. */
        "amber-700": rgb("warn"),
        "amber-800": rgb("warn"),
        "red-700": rgb("bad"),
        "emerald-700": rgb("good"),
        "emerald-800": rgb("good"),
      },

      textColor: {
        "tk-onyx": rgb("ink"),
        "tk-slate": rgb("ink-2"),
        "tk-teal": rgb("accent-ink"),
        "red-700": rgb("bad"),
        "red-800": rgb("bad"),
        "amber-700": rgb("warn"),
        "amber-800": rgb("warn"),
        "amber-900": rgb("warn"),
        /* CHANGED: ok -> good. Light moves 6.55 -> 6.54 (a 0.01 delta) and
           teal -> green; dark 8.25 -> 9.55. MUST ship with the
           backgroundColor.emerald-* change: work/Timesheet.tsx:88 and
           tasks/TaskRows.tsx:312 pair fill and ink. */
        "emerald-700": rgb("good"),
        "emerald-800": rgb("good"),

        /* NOT MAPPED, deliberately: `white`. 24 sites, correct as a literal on
           bg-tk-onyx (18.33:1) and on the frozen bg-[#A62228]/bg-[#8A5A05]
           buttons. Remapping it onto --on-accent is FORECLOSED: 15 sites pair
           text-tk-linen with bg-tk-onyx, and that would repaint linen text on
           locked onyx chrome. */
      },

      borderColor: {
        /* THE LOCK. Redundant with colors.line by design. */
        line: "var(--line)",
        "line-strong": "var(--line-strong)",

        /* UNMAPPED: `white` — the key is GONE, not re-pointed. All 5 sites
           read: PayloadBlock:30 (border-b border-white/10 on bg-[#16221F]),
           PayloadBlock:45 (border-white/15), CopyButton:65 (border-white/15,
           tone="dark", only rendered inside PayloadBlock), PortalShell:25
           (border-white/50, frozen), retainers/[slug]:324 (border-2
           border-white, the one card edge — a punch-out halo round an invoice
           dot). Because --card-rgb is 255 255 255 in LIGHT, deleting the key
           is byte-identical in light at ALL FIVE. In DARK it is the difference
           between a hairline and none: mapped, white/10 on #16221F composites
           to #16221F — 1.0000:1. Unmapped it is 1.35:1. */

        "tk-slate": rgb("line"),
        "tk-teal": rgb("accent-ink"),
        "tk-onyx": rgb("ink"),

        /* Only the two tone borders that HAVE call sites. Verified: the whole
           population is border-amber-700 at ProjectPeek:47 (/20),
           revenue/page:162 (/30), work/Timesheet:452 (/40 + a bare
           hover:border-amber-700), invoices/[number]:121 (/25),
           retainers/page:118 (/30), plus one hover:border-red-700 at
           settings/portals:74 — 7 occurrences across 6 sites. border-amber-800,
           border-emerald-700 and border-emerald-800 do not exist anywhere.
           Both currently INVERT across themes (amber-700 5.02 light / 3.31
           dark; red-700 6.47 / 2.57); both stop. */
        "amber-700": rgb("warn"),
        "red-700": rgb("bad"),

        /* DELIBERATELY NOT MAPPED — amber-300 / amber-400 / amber-500 /
           red-400 / black. A blanket map turns a pale rim into a heavy stroke
           in LIGHT: amber-300 #FCD34D 1.44 -> 5.92 (a 4x jump), amber-400
           1.67 -> 5.92, amber-500 2.15 -> 5.92, red-400 2.77 -> 7.29. Those
           are 9 per-site decisions, listed in Stage 4. `black` has exactly one
           site in the codebase (settings/ColorGrid.tsx:74) and mapping it
           would be a category error. */
      },

      divideColor: {
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        "tk-slate": rgb("line"),
        /* REMOVED: "tk-linen". Its single consumer,
           timesheet/FloatingClock.tsx:227 (divide-y divide-tk-linen/20), sits
           on a bg-tk-teal pill that is teal in BOTH themes; mapped to --line
           it paints a SLATE divider (#065D59, 1.18:1) in LIGHT where linen
           (#30837D, 1.45:1) was designed. A live light regression the bridge
           itself shipped. Its sibling two lines below
           (border-tk-linen/25, :280) has no borderColor key, falls through to
           the brand hex, and is correct in both themes — the same widget
           carrying both behaviours. */
      },

      ringColor: {
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        "tk-slate": rgb("line"),
        "tk-teal": rgb("accent-ink"),
        "accent-ink": rgb("accent-ink"),
      },

      /* NEW CHANNEL. There is no outlineColor block today, so all 6
         outline-tk-teal focus rings fall through to the base colors key and
         resolve to the LITERAL #006965 in dark: 2.80:1 against the dark canvas
         and 2.54:1 against the dark card — under the 3:1 non-text floor, on
         the one affordance that must never be the weakest line on the page.
         Mapping to --accent-ink is byte-identical in light and takes dark to
         #4FC9BE (9.10 canvas / 8.25 card). Sites: FloatingClock:221,
         ToolButton:72, LeftOffBoard:159, :161, :340, :434. */
      outlineColor: {
        "tk-teal": rgb("accent-ink"),
        "accent-ink": rgb("accent-ink"),
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
      },

      placeholderColor: {
        /* Currently UNREACHABLE dead config: it serves the bare
           `placeholder-tk-slate` syntax, and all 21 placeholder sites use the
           `placeholder:text-*` VARIANT, which reads textColor. Kept until
           Stage 4 lands placeholder:text-ink-3, then deleted. */
        "tk-slate": rgb("ink-3"),
      },

      boxShadow: {
        card: "var(--shadow-card)",
        hover: "var(--shadow-hover)",
        /* The 6 shadow-2xl + 6 shadow-xl modal/drawer panels have nothing
           holding them off the page in dark: shadow-2xl peaks at 1.0426:1 over
           the canvas and they all sit on a scrim that was 1.0000:1. A pure
           black shadow at alpha 1.0 with zero blur tops out at 1.1456:1 over
           #0F1615 — LESS than the card surface step. The overlay token's 7%
           linen hairline (1.196:1) is what actually cuts a modal out. */
        overlay: "var(--shadow-overlay)",
      },

      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: ["var(--font-inter-tight)", "var(--font-inter)", "system-ui", "sans-serif"],
        ui: ["var(--font-jakarta)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}

export default config
