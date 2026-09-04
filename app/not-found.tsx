/*
  With two root layouts there is no app/layout.tsx, so Next hands the built-in
  /_not-found entry a bare <html><body> (next-app-loader: rootLayout falls back
  to next/dist/client/components/default-layout) — no lang, no font variables
  and no globals.css, because the stylesheet is only imported from the two
  group layouts. Without this file an unmatched URL renders as unstyled Times
  New Roman, and the build does not warn. Import the stylesheet here so a 404
  is still a Tall Karol page.

  It claims .tk-light: a 404 is reached from anywhere, including signed out.
*/
import Link from "next/link"
import "./globals.css"

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
