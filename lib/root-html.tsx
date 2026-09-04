import type { Metadata, Viewport } from "next"
import { Inter, Inter_Tight, Plus_Jakarta_Sans } from "next/font/google"
import { PwaRegister } from "@/components/PwaRegister"

/**
 * The one <html>/<body>, shared by the two root layouts.
 *
 * There are two roots on purpose. The light-only routes used to be protected
 * only by app/layout.tsx hardcoding data-theme="light" — but App Router never
 * re-renders a root layout on soft navigation and nothing removes the
 * attribute, so a <Link> from a dark CRM into /invoice-print carried the dark
 * stamp with it. Six call sites do exactly that. Next forces a full document
 * load between root layouts, which makes the leak unrepresentable rather than
 * merely unlikely.
 *
 * `theme` undefined stamps NOTHING, which is what "system" means: no
 * attribute, so the @media (prefers-color-scheme: dark) block in globals.css
 * decides with no JS in the loop. The bytes that leave the server already say
 * `dark`, so view-source, screenshots and script-blocked browsers agree with
 * the screen, and color-scheme governs the browser's own root canvas,
 * overscroll rubber-band and form controls on the FIRST paint. That last part
 * is why the route split is the primary mechanism and .tk-light is only the
 * fallback: a class on a subtree cannot reach the root canvas.
 */

/* The site's own faces: Inter Tight for headings and big numbers, Plus
   Jakarta Sans for UI labels, Inter for running text. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-inter-tight",
  display: "swap",
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
})

export const rootMetadata: Metadata = {
  title: {
    default: "Tall Karol CRM",
    template: "%s · Tall Karol CRM",
  },
  description: "Inquiry inbox and client portal for Tall Karol",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/tk-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/tk-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/tk-180.png", sizes: "180x180", type: "image/png" }],
  },
  // Saved to a home screen, this opens straight onto the clock.
  appleWebApp: {
    capable: true,
    title: "TallKarol",
    statusBarStyle: "default",
  },
}

/* Fixed in BOTH roots on purpose. A { media } pair would key off
   prefers-color-scheme rather than the tk_theme cookie, so a user who chose
   light on a dark OS would get a dark title bar. */
export const rootViewport: Viewport = {
  themeColor: "#006965",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export function RootHtml({
  theme,
  children,
}: {
  /** "light" | "dark", or undefined for system (stamps no attribute). */
  theme?: "light" | "dark"
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      {...(theme ? { "data-theme": theme } : {})}
      className={`${inter.variable} ${interTight.variable} ${jakarta.variable}`}
    >
      <body className="min-h-screen font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
