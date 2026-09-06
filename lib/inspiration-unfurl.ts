import {
  classifyUrl,
  screenshotUrl,
  type ClassifiedUrl,
} from "@/lib/inspiration"

/**
 * Fill in a classified URL: og:title / og:image for websites, leave
 * known embeds alone. A failed fetch still pins — the classify result
 * is enough to render a card.
 */

const FETCH_MS = 8_000
const MAX_BYTES = 1_500_000
const UA =
  "Mozilla/5.0 (compatible; TallKarolCRM/1.0; +https://www.tallkarol.com)"

export type Unfurled = ClassifiedUrl & {
  description: string
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
  }
  if (host.includes(":")) {
    if (
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd")
    ) {
      return true
    }
  }
  return false
}

function attr(tag: string, name: string): string {
  const double = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"))
  if (double) return decode(double[1])
  const single = tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"))
  if (single) return decode(single[1])
  return ""
}

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim()
}

function metaContent(html: string, keys: string[]): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const key of keys) {
    for (const tag of tags) {
      const prop = attr(tag, "property") || attr(tag, "name")
      if (prop.toLowerCase() === key.toLowerCase()) {
        const content = attr(tag, "content")
        if (content) return content
      }
    }
  }
  return ""
}

function pageTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? decode(match[1].replace(/\s+/g, " ")) : ""
}

function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).href
  } catch {
    return ""
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const parsed = new URL(url)
  if (isPrivateHost(parsed.hostname)) return null

  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_MS),
  })
  if (!response.ok) return null
  const finalHost = new URL(response.url).hostname
  if (isPrivateHost(finalHost)) return null
  const type = response.headers.get("content-type") ?? ""
  if (!type.includes("html") && !type.includes("xml") && type !== "") return null

  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    return text.slice(0, MAX_BYTES)
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    size += value.byteLength
    if (size > MAX_BYTES) {
      reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

export async function unfurl(raw: string): Promise<Unfurled | null> {
  const classified = classifyUrl(raw)
  if (!classified) return null

  // Known embeds already have a title and (usually) a preview. Instagram
  // and TikTok login-wall the HTML, so a fetch would only add latency.
  if (
    classified.provider === "instagram" ||
    classified.provider === "tiktok" ||
    classified.provider === "image"
  ) {
    return { ...classified, description: "" }
  }

  try {
    const html = await fetchHtml(classified.canonical)
    if (!html) {
      return withScreenshot(classified, "")
    }
    const title =
      metaContent(html, ["og:title", "twitter:title"]) || pageTitle(html)
    const description = metaContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ])
    const image = metaContent(html, ["og:image", "twitter:image", "og:image:url"])
    const siteName = metaContent(html, ["og:site_name"])
    return withScreenshot(
      {
        ...classified,
        title: title || classified.title,
        siteName: siteName || classified.siteName,
        previewUrl: image
          ? absolutize(image, classified.canonical)
          : classified.previewUrl,
      },
      description.slice(0, 400)
    )
  } catch {
    return withScreenshot(classified, "")
  }
}

function withScreenshot(classified: ClassifiedUrl, description: string): Unfurled {
  const previewUrl =
    classified.previewUrl ||
    (classified.kind === "website" ? screenshotUrl(classified.canonical) : "")
  return { ...classified, previewUrl, description }
}
