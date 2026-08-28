/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Same escape hatch as the marketing site: NEXT_DIST_DIR=.next-build lets a
  // one-off `next build` run while `next dev` holds .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return [
      // The Analytics page became the Insights hub.
      { source: "/analytics", destination: "/insights", permanent: true },
    ]
  },
}

export default nextConfig
