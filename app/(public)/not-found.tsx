/*
  With two root layouts there is no app/layout.tsx, so an unmatched URL would
  otherwise render through Next's bare <html><body> fallback — no lang, no font
  variables and no globals.css, because the stylesheet is only imported from
  the two group layouts. Without this file a 404 is unstyled Times New Roman,
  and the build does not warn.

  It lives INSIDE (public) rather than at the app root: a root-level
  not-found.tsx is a page like any other and Next refuses to build one with no
  root layout above it ("not-found.tsx doesn't have a root layout"). Here it
  inherits the light root, which is what it wanted anyway — a 404 is reached
  from anywhere, including signed out.
*/
import Link from "next/link"
import "../globals.css"

export default function NotFound() {
  return (
    <main className="tk-light grid min-h-screen place-items-center bg-canvas px-4 text-center font-sans">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-3">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Nothing here</h1>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-accent-ink hover:underline">
          Back to the CRM
        </Link>
      </div>
    </main>
  )
}
