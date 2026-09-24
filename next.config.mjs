/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Same escape hatch as the marketing site: NEXT_DIST_DIR=.next-build lets a
  // one-off `next build` run while `next dev` holds .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /**
   * Recipient-facing slink pages.
   *
   * The route handlers set these themselves, but a page is a server component
   * and cannot — so they are declared here for the whole tree. `no-referrer` is
   * the one that matters: without it, any outbound click from a slink hands the
   * page's URL to the site being visited.
   */
  async headers() {
    return [
      {
        source: "/slink/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
        ],
      },
    ]
  },
  async redirects() {
    return [
      // The Analytics page became the Insights hub.
      { source: "/analytics", destination: "/insights", permanent: true },
      // Sessions left the Timesheet for Admin (24 Sep 2026). The query
      // string (filters, a peek) carries over. /admin has no page of its
      // own; its landing is Settings, as the rail's Admin icon is.
      { source: "/timesheet/sessions", destination: "/admin/sessions", permanent: true },
      { source: "/admin", destination: "/settings", permanent: false },
      // Delivery was deleted (24 Sep 2026) — Karol: dead weight — and the
      // project and punch list lists went the same day: both live inside
      // their client now. Old links and the Mac app's Go menu land on the
      // client roster; /projects/[slug] and /punchlists/[slug] are pages
      // that redirect into the right client.
      { source: "/delivery", destination: "/clients", permanent: false },
      { source: "/pipeline", destination: "/clients", permanent: false },
      { source: "/projects", destination: "/clients", permanent: false },
      { source: "/punchlists", destination: "/clients", permanent: false },
    ]
  },
}

export default nextConfig
