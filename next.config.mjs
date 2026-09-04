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
    ]
  },
}

export default nextConfig
