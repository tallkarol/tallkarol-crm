import { providerLabel } from "@/lib/inspiration"
import type { PinView } from "@/lib/inspiration-data"

function Iframe({
  src,
  title,
  tall,
}: {
  src: string
  title: string
  tall?: boolean
}) {
  return (
    <iframe
      src={src}
      title={title}
      loading="lazy"
      allowFullScreen
      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      className={
        tall
          ? "block h-[640px] w-full border-0 bg-well"
          : "block aspect-video w-full border-0 bg-well"
      }
    />
  )
}

export function PinMedia({ pin }: { pin: PinView }) {
  const label = pin.title || providerLabel(pin.provider)

  if (pin.embedUrl) {
    const tall = pin.provider === "instagram" || pin.provider === "tiktok"
    return <Iframe src={pin.embedUrl} title={label} tall={tall} />
  }

  if (pin.previewUrl) {
    return (
      // External og/screenshot URLs are not in next/image's allowlist on
      // purpose — a pin can come from anywhere Karol drops in chat.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pin.previewUrl}
        alt={label}
        width={1200}
        height={800}
        className="block w-full bg-well object-cover"
      />
    )
  }

  return (
    <div className="flex min-h-[140px] items-center justify-center bg-well px-4 py-10 text-center text-[13px] font-semibold text-ink-3">
      {pin.siteName || "Link"}
    </div>
  )
}
