import { excludeTrackingUrl } from "@/lib/internal-traffic"

export function ExcludeIpButton({ origin }: { origin: string }) {
  const href = excludeTrackingUrl(origin)
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg border border-line bg-card px-3.5 py-1.5 text-sm font-semibold text-tk-onyx hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
    >
      Exclude IP from tracking
    </a>
  )
}
