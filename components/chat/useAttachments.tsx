"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { ATTACH, attachmentPath, type AttachmentView } from "@/lib/chat/attachments"

/**
 * Screenshots in the box: paste (⌘V) or drop, and each one uploads at once
 * so Send never waits on it. Shared by the /chat composer and the dock's.
 *
 * A paste that carries text is left alone. Copying cells from Numbers or a
 * paragraph from Word puts a rendered picture on the clipboard beside the
 * text, and the text is what was meant.
 */

export type DraftImage = {
  key: string
  name: string
  /** Object URL of what was pasted, so the chip shows before the upload lands. */
  preview: string
  status: "uploading" | "ready" | "failed"
  id?: string
  error?: string
}

export function useAttachments() {
  const [items, setItems] = useState<DraftImage[]>([])
  const [dragging, setDragging] = useState(false)
  const latest = useRef(items)
  latest.current = items

  useEffect(() => () => latest.current.forEach((item) => URL.revokeObjectURL(item.preview)), [])

  const patch = useCallback((key: string, next: Partial<DraftImage>) => {
    setItems((all) => all.map((item) => (item.key === key ? { ...item, ...next } : item)))
  }, [])

  const add = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"))
      const room = ATTACH.perMessage - latest.current.length
      const drafts: DraftImage[] = images.map((file, i) => ({
        key: `${Date.now()}-${i}-${file.name}`,
        name: file.name || "screenshot",
        preview: URL.createObjectURL(file),
        status: i < room ? "uploading" : "failed",
        error: i < room ? undefined : `Up to ${ATTACH.perMessage} images in one message.`,
      }))
      setItems((all) => [...all, ...drafts])
      drafts.forEach((draft, i) => {
        if (draft.status !== "uploading") return
        upload(images[i]).then(
          (saved) => patch(draft.key, { status: "ready", id: saved.id, name: saved.name }),
          (err: unknown) =>
            patch(draft.key, { status: "failed", error: err instanceof Error ? err.message : String(err) })
        )
      })
    },
    [patch]
  )

  const remove = useCallback((key: string) => {
    setItems((all) => {
      const gone = all.find((item) => item.key === key)
      if (gone) URL.revokeObjectURL(gone.preview)
      return all.filter((item) => item.key !== key)
    })
  }, [])

  const clear = useCallback(() => {
    latest.current.forEach((item) => URL.revokeObjectURL(item.preview))
    setItems([])
  }, [])

  function onPaste(e: React.ClipboardEvent) {
    if (e.clipboardData.getData("text/plain")) return
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length === 0) return
    e.preventDefault()
    add(files)
  }

  const dropZone = {
    onDragOver(e: React.DragEvent) {
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setDragging(true)
    },
    onDragLeave(e: React.DragEvent) {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setDragging(false)
    },
    onDrop(e: React.DragEvent) {
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      setDragging(false)
      add(Array.from(e.dataTransfer.files))
    },
  }

  const readyIds = items.flatMap((item) => (item.status === "ready" && item.id ? [item.id] : []))
  return {
    items,
    readyIds,
    uploading: items.some((item) => item.status === "uploading"),
    failed: items.some((item) => item.status === "failed"),
    dragging,
    onPaste,
    dropZone,
    remove,
    clear,
  }
}

/**
 * Downsize in the browser (see lib/chat/attachments.ts for why), then send
 * the bytes as the body. A PNG that is still too heavy — a photo, usually —
 * goes as JPEG on a white ground, since JPEG has no transparency.
 */
async function upload(file: File): Promise<AttachmentView> {
  const blob = await shrink(file)
  const response = await fetch(attachmentPath(), {
    method: "POST",
    headers: { "content-type": blob.type, "x-file-name": encodeURIComponent(file.name) },
    body: blob,
  })
  const json = (await response.json().catch(() => ({}))) as { attachment?: AttachmentView; error?: string }
  if (!response.ok || !json.attachment) throw new Error(json.error || `Upload failed (${response.status}).`)
  return json.attachment
}

async function shrink(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("This browser cannot read that image.")
  }
  const scale = Math.min(1, ATTACH.maxEdge / Math.max(bitmap.width, bitmap.height))
  const asIs = (file.type === "image/png" || file.type === "image/jpeg") && file.size <= ATTACH.maxBytes
  if (scale === 1 && asIs) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser cannot resize images.")
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let blob = await encode(canvas, "image/png")
  if (blob.size > ATTACH.maxBytes) {
    const flat = document.createElement("canvas")
    flat.width = canvas.width
    flat.height = canvas.height
    const fctx = flat.getContext("2d")
    if (!fctx) throw new Error("This browser cannot resize images.")
    fctx.fillStyle = "white"
    fctx.fillRect(0, 0, flat.width, flat.height)
    fctx.drawImage(canvas, 0, 0)
    blob = await encode(flat, "image/jpeg", 0.88)
  }
  if (blob.size > ATTACH.maxBytes) throw new Error("Still over 5 MB after shrinking.")
  return blob
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))), type, quality)
  )
}

/** The chips above the text: a thumbnail each, a spinner while it uploads, × to drop it. */
export function AttachmentTray({
  items,
  onRemove,
  size = "md",
}: {
  items: DraftImage[]
  onRemove: (key: string) => void
  size?: "sm" | "md"
}) {
  if (items.length === 0) return null
  const failure = items.find((item) => item.status === "failed")
  return (
    <div className={cn(size === "md" ? "px-3 pt-3" : "pb-2")}>
      <ul className="flex flex-wrap gap-2" aria-label="Attached images">
        {items.map((item) => (
          <li
            key={item.key}
            title={item.error ?? item.name}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-lg border bg-well",
              size === "md" ? "size-14" : "size-11",
              item.status === "failed" ? "border-bad" : "border-line"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
            <img
              src={item.preview}
              alt={item.name}
              className={cn(
                "size-full object-cover",
                item.status === "uploading" && "opacity-50",
                item.status === "failed" && "opacity-40"
              )}
            />
            {item.status === "uploading" ? (
              <span className="absolute inset-0 grid place-items-center text-tk-onyx" role="status" aria-label="Uploading">
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
              </span>
            ) : null}
            {item.status === "failed" ? (
              <span className="absolute inset-0 grid place-items-center text-bad" aria-hidden>
                <AlertCircle className="size-4" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              aria-label={`Remove ${item.name}`}
              className="absolute right-0.5 top-0.5 grid size-[18px] place-items-center rounded-full border border-line bg-card text-ink-2 hover:text-tk-onyx"
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {failure ? (
        <p className="mt-1.5 text-[11.5px] text-bad">
          {failure.error ?? "That image did not upload."} Remove it to send.
        </p>
      ) : null}
    </div>
  )
}
