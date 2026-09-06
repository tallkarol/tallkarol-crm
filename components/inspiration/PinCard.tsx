import { deletePin } from "@/app/(admin)/inspiration/actions"
import { PinMedia } from "@/components/inspiration/PinEmbed"
import { Card } from "@/components/ui/Card"
import { providerLabel } from "@/lib/inspiration"
import type { PinView } from "@/lib/inspiration-data"

export function PinCard({
  pin,
  boardSlug,
}: {
  pin: PinView
  boardSlug: string
}) {
  const host = (() => {
    try {
      return new URL(pin.url).hostname.replace(/^www\./, "")
    } catch {
      return pin.siteName
    }
  })()

  return (
    <Card className="mb-4 break-inside-avoid overflow-hidden p-0">
      <PinMedia pin={pin} />
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <a
            href={pin.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-[13.5px] font-semibold text-tk-onyx hover:text-tk-teal"
          >
            {pin.title || host}
          </a>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-ink-3">
            {providerLabel(pin.provider)}
            {host && pin.provider !== "instagram" ? ` · ${host}` : ""}
          </p>
          {pin.note ? (
            <p className="mt-1.5 text-[12.5px] text-tk-slate">{pin.note}</p>
          ) : null}
        </div>
        <form action={deletePin}>
          <input type="hidden" name="id" value={pin.id} />
          <input type="hidden" name="slug" value={boardSlug} />
          <button
            type="submit"
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-ink-3 hover:bg-well hover:text-bad"
            aria-label={`Remove ${pin.title || "pin"}`}
          >
            Remove
          </button>
        </form>
      </div>
    </Card>
  )
}
