/**
 * Inspiration boards — the rules that do not need a database.
 *
 * A pin is a URL Karol dropped on a board. The kind is decided from the
 * host and path: Instagram/YouTube/Vimeo/TikTok/X become embeds, a direct
 * image stays an image, everything else is a website that wants a
 * screenshot. The fetch that fills title and og:image lives in
 * inspiration-unfurl.ts so this file stays importable from the check.
 */

export const PIN_KINDS = ["video", "website", "image", "note"] as const
export type PinKind = (typeof PIN_KINDS)[number]

export const PIN_PROVIDERS = [
  "instagram",
  "youtube",
  "vimeo",
  "tiktok",
  "x",
  "web",
  "image",
] as const
export type PinProvider = (typeof PIN_PROVIDERS)[number]

export type ClassifiedUrl = {
  kind: PinKind
  provider: PinProvider
  /** Tracking stripped, host canonicalised. */
  canonical: string
  host: string
  embedUrl: string
  previewUrl: string
  siteName: string
  title: string
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg)(\?|#|$)/i

export function isPinKind(value: string): value is PinKind {
  return (PIN_KINDS as readonly string[]).includes(value)
}

export function isPinProvider(value: string): value is PinProvider {
  return (PIN_PROVIDERS as readonly string[]).includes(value)
}

export function slugifyBoard(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

/** Accepts a bare host and turns it into an https URL. */
export function normalizeInspirationUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const absolute = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`
  try {
    const url = new URL(absolute)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    url.hash = ""
    return url
  } catch {
    return null
  }
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase()
}

function stripTracking(url: URL): URL {
  const next = new URL(url.href)
  const drop = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "igshid",
    "igsh",
    "igsi",
    "si",
    "feature",
    "fbclid",
    "gclid",
  ]
  for (const key of drop) next.searchParams.delete(key)
  if (next.searchParams.toString() === "") next.search = ""
  return next
}

function youtubeId(url: URL): string | null {
  const host = hostOf(url)
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0]
    return id ? id.slice(0, 11) : null
  }
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const v = url.searchParams.get("v")
    if (v) return v.slice(0, 11)
    const parts = url.pathname.split("/").filter(Boolean)
    if (
      parts[0] &&
      ["embed", "shorts", "live", "v"].includes(parts[0]) &&
      parts[1]
    ) {
      return parts[1].slice(0, 11)
    }
  }
  return null
}

function instagramPath(url: URL): { kind: string; code: string } | null {
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts[0] === "reel" || parts[0] === "p" || parts[0] === "tv") {
    return parts[1] ? { kind: parts[0], code: parts[1] } : null
  }
  return null
}

function vimeoId(url: URL): string | null {
  const host = hostOf(url)
  const parts = url.pathname.split("/").filter(Boolean)
  if (host === "player.vimeo.com" && parts[0] === "video" && parts[1]) {
    return /^\d+$/.test(parts[1]) ? parts[1] : null
  }
  if (host === "vimeo.com") {
    const last = parts[parts.length - 1]
    return last && /^\d+$/.test(last) ? last : null
  }
  return null
}

function tiktokId(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean)
  const videoAt = parts.indexOf("video")
  if (videoAt >= 0 && parts[videoAt + 1] && /^\d+$/.test(parts[videoAt + 1])) {
    return parts[videoAt + 1]
  }
  return null
}

function tweetId(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean)
  const statusAt = parts.indexOf("status")
  if (statusAt >= 0 && parts[statusAt + 1] && /^\d+$/.test(parts[statusAt + 1])) {
    return parts[statusAt + 1]
  }
  return null
}

export function classifyUrl(raw: string): ClassifiedUrl | null {
  const parsed = normalizeInspirationUrl(raw)
  if (!parsed) return null
  const url = stripTracking(parsed)
  const host = hostOf(url)

  if (IMAGE_EXT.test(url.pathname) || IMAGE_EXT.test(url.href)) {
    const canonical = url.href
    return {
      kind: "image",
      provider: "image",
      canonical,
      host,
      embedUrl: "",
      previewUrl: canonical,
      siteName: host,
      title: decodeURIComponent(url.pathname.split("/").pop() || "") || host,
    }
  }

  if (host === "instagram.com" || host === "instagr.am") {
    const path = instagramPath(url)
    if (path) {
      const canonical = `https://www.instagram.com/${path.kind}/${path.code}/`
      return {
        kind: "video",
        provider: "instagram",
        canonical,
        host: "instagram.com",
        embedUrl: `${canonical}embed`,
        previewUrl: "",
        siteName: "Instagram",
        title: path.kind === "reel" ? "Instagram reel" : "Instagram post",
      }
    }
  }

  const yt = youtubeId(url)
  if (yt) {
    return {
      kind: "video",
      provider: "youtube",
      canonical: `https://www.youtube.com/watch?v=${yt}`,
      host: "youtube.com",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}`,
      previewUrl: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      siteName: "YouTube",
      title: "YouTube video",
    }
  }

  const vim = vimeoId(url)
  if (vim) {
    return {
      kind: "video",
      provider: "vimeo",
      canonical: `https://vimeo.com/${vim}`,
      host: "vimeo.com",
      embedUrl: `https://player.vimeo.com/video/${vim}`,
      previewUrl: "",
      siteName: "Vimeo",
      title: "Vimeo video",
    }
  }

  if (host === "tiktok.com" || host === "www.tiktok.com") {
    const id = tiktokId(url)
    if (id) {
      return {
        kind: "video",
        provider: "tiktok",
        canonical: url.href.replace(/\/$/, "") + "/",
        host: "tiktok.com",
        embedUrl: `https://www.tiktok.com/embed/v2/${id}`,
        previewUrl: "",
        siteName: "TikTok",
        title: "TikTok",
      }
    }
  }

  if (host === "twitter.com" || host === "x.com" || host === "mobile.twitter.com") {
    const id = tweetId(url)
    if (id) {
      return {
        kind: "video",
        provider: "x",
        canonical: `https://x.com/i/status/${id}`,
        host: "x.com",
        embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}`,
        previewUrl: "",
        siteName: "X",
        title: "Post on X",
      }
    }
  }

  const canonical = url.href
  return {
    kind: "website",
    provider: "web",
    canonical,
    host,
    embedUrl: "",
    previewUrl: "",
    siteName: host,
    title: host,
  }
}

/** Public screenshot proxy used when a site has no og:image. */
export function screenshotUrl(canonical: string): string {
  return `https://image.thum.io/get/width/1200/noanimate/${encodeURIComponent(canonical)}`
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case "instagram":
      return "Instagram"
    case "youtube":
      return "YouTube"
    case "vimeo":
      return "Vimeo"
    case "tiktok":
      return "TikTok"
    case "x":
      return "X"
    case "image":
      return "Image"
    default:
      return "Website"
  }
}
