"use client"

import { useState } from "react"

/**
 * The secret is not in the page. Pressing this fetches it, and the server
 * writes a `revealed` event against the viewer's address before answering —
 * so"who saw the password" has an answer, and the watermark behind this row
 * means a screenshot carries a name with it.
 */
export function RevealButton({ blockId, publicId }: { blockId: string; publicId: string }) {
  const [secret, setSecret] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  async function reveal() {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/slink/${publicId}/reveal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blockId }),
      })
      if (!res.ok) {
        setError(res.status === 401 ? "Your access has ended. Ask for a fresh link." : "Could not load it.")
        return
      }
      const data = (await res.json()) as { secret?: string }
      setSecret(data.secret ?? "")
    } catch {
      setError("Could not load it.")
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* the value is on screen to select */
    }
  }

  if (error) {
    return <span className="text-[12px] text-tk-tomato">{error}</span>
  }

  if (secret) {
    return (
      <span className="col-span-2 flex items-center gap-3">
        <code className="flex-1 break-all font-mono text-[12.5px] text-tk-onyx">{secret}</code>
        <button
          type="button"
          onClick={copy}
          className="whitespace-nowrap rounded-md border border-line px-2 py-1 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-ink-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
    )
  }

  return (
    <span className="col-span-2 flex items-center gap-3">
      <span className="flex-1 font-mono text-[12.5px] tracking-[0.16em] text-ink-3">••••••••••••</span>
      <button
        type="button"
        onClick={reveal}
        disabled={busy}
        className="whitespace-nowrap rounded-md border border-line px-2 py-1 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-ink-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal disabled:opacity-50"
      >
        {busy ? "…" : "Reveal"}
      </button>
    </span>
  )
}
