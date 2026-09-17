/**
 * Pasted screenshots — the rules every side shares.
 *
 * PURE: the composer, the upload route, the queue route and the worker all
 * import this, so nothing here may touch the database or the DOM.
 *
 * The browser downsizes before it uploads (components/chat/useAttachments.tsx):
 * a Retina screenshot is 3024 px wide and the models shrink anything past
 * ~1600 px anyway, so the long edge is capped here and whatever survives is
 * re-encoded as PNG, or JPEG when PNG is still too heavy. The server then
 * only has to recognise two formats, and the bytes it keeps are the bytes the
 * model is sent.
 */

export const ATTACH = {
  /** Per image, after the browser has downsized it. */
  maxBytes: 5 * 1024 * 1024,
  /** Longest edge the browser keeps. */
  maxEdge: 2000,
  /** Anything larger than this was not produced by our own canvas. */
  maxDimension: 8000,
  perMessage: 6,
  /** Images handed to the model in one turn, newest first. */
  perTurn: 6,
  /** An upload nobody sent is swept after this long. */
  orphanMs: 24 * 60 * 60 * 1000,
} as const

export type AttachMime = "image/png" | "image/jpeg"

/** What a bubble needs to draw a thumbnail — never the bytes. */
export type AttachmentView = { id: string; name: string; width: number; height: number }

export type ImageInfo = { mime: AttachMime; width: number; height: number }

/** The browser's door: POST to upload, GET `/<id>` to look. Session auth. */
export function attachmentPath(id?: string): string {
  return id ? `/chat/attachments/${id}` : "/chat/attachments"
}

/**
 * What the bytes actually are, read from the header — never from the
 * filename or the Content-Type the browser sent. Null for anything that is
 * not a PNG or a baseline/progressive JPEG with a readable size.
 */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  if (isPng(bytes)) {
    if (bytes.length < 24) return null
    const width = u32(bytes, 16)
    const height = u32(bytes, 20)
    return width > 0 && height > 0 ? { mime: "image/png", width, height } : null
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const size = jpegSize(bytes)
    return size ? { mime: "image/jpeg", ...size } : null
  }
  return null
}

function isPng(b: Uint8Array): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return b.length >= 8 && sig.every((v, i) => b[i] === v)
}

function u32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
}

function u16(b: Uint8Array, at: number): number {
  return (b[at] << 8) | b[at + 1]
}

/** Walk the segments to the first start-of-frame; its height and width are the image's. */
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let at = 2
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) return null
    const marker = b[at + 1]
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      at += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    const length = u16(b, at + 2)
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isFrame) {
      const height = u16(b, at + 5)
      const width = u16(b, at + 7)
      return width > 0 && height > 0 ? { width, height } : null
    }
    if (length < 2) return null
    at += 2 + length
  }
  return null
}

/** What the upload is, or why it is refused. */
export function refuseImage(bytes: Uint8Array): { info: ImageInfo; error: null } | { info: null; error: string } {
  if (bytes.length === 0) return { info: null, error: "That file is empty." }
  if (bytes.length > ATTACH.maxBytes) {
    return { info: null, error: `Images are capped at ${ATTACH.maxBytes / 1024 / 1024} MB.` }
  }
  const info = sniffImage(bytes)
  if (!info) return { info: null, error: "Only PNG and JPEG images can be attached." }
  if (info.width > ATTACH.maxDimension || info.height > ATTACH.maxDimension) {
    return { info: null, error: `Images are capped at ${ATTACH.maxDimension} px a side.` }
  }
  return { info, error: null }
}

/**
 * A name fit for a Content-Disposition header and a chip: no path, no
 * quotes or control characters, the extension matching what the bytes are.
 * A pasted screenshot usually arrives as "image.png", which says nothing,
 * so that becomes "screenshot".
 */
export function attachmentName(raw: string, mime: AttachMime): string {
  const ext = mime === "image/png" ? "png" : "jpg"
  const base = (raw.split(/[\\/]/).pop() ?? "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[\u0000-\u001f\u007f"\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
  const stem = !base || /^image$/i.test(base) ? "screenshot" : base
  return `${stem}.${ext}`
}

/** What a thread is called when its first message is only pictures. */
export function imagesTitle(count: number): string {
  return count === 1 ? "Screenshot" : `${count} screenshots`
}

type WithImages = { images?: { id: string }[] }

/**
 * Which images a turn carries: the newest `max` in the thread, handed over
 * oldest first so the numbers read in the same order as the transcript.
 * A follow-up ("and the button on the left?") needs the screenshot from two
 * messages back, and each turn is a fresh agent, so earlier images ride
 * along until newer ones push them out.
 */
export function pickImages(messages: WithImages[], max: number = ATTACH.perTurn): string[] {
  const all = messages.flatMap((m) => (m.images ?? []).map((i) => i.id))
  return max > 0 ? all.slice(-max) : []
}

/**
 * The line under a message in the transcript, so the model knows which
 * picture belongs to which message. `sent` is what `pickImages` chose, in
 * order; image N in the prompt is `sent[N - 1]`.
 */
export function imageNote(images: { id: string }[] | undefined, sent: string[]): string {
  if (!images || images.length === 0) return ""
  const numbers = images.map((i) => sent.indexOf(i.id) + 1)
  const shown = numbers.filter((n) => n > 0)
  const dropped = numbers.length - shown.length
  const parts: string[] = []
  if (shown.length === 1) parts.push(`image ${shown[0]} attached`)
  else if (shown.length > 1) parts.push(`images ${shown.join(", ")} attached`)
  if (dropped === 1) parts.push("1 older image not resent")
  else if (dropped > 1) parts.push(`${dropped} older images not resent`)
  return `[${parts.join("; ")}]`
}
