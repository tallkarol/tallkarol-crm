import { excludeTrackingUrl } from "@/lib/internal-traffic"

export function ExcludeIpButton({ origin }: { origin: string }) {
  const href = excludeTrackingUrl(origin)
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg border border-tk-slate/20 bg-white px-3.5 py-1.5 text-sm font-semibold text-tk-onyx hover:border-tk-teal hover:text-tk-teal"
    >
      Exclude IP from tracking
    </a>
  )
}
