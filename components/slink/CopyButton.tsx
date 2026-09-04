"use client"

import { useState } from"react"

/**
 * Copy a value without selecting it by hand. These pages exist so a DNS value
 * or a routing number does not get retyped, which is where hand-offs go wrong.
 */
export function CopyButton({ value, label ="Copy" }: { value: string; label?: string }) {
 const [done, setDone] = useState(false)

 async function copy() {
 try {
 await navigator.clipboard.writeText(value)
 } catch {
 // Clipboard is blocked in some embedded views; fall back to a selection.
 const ta = document.createElement("textarea")
 ta.value = value
 ta.setAttribute("readonly","")
 ta.style.position ="fixed"
 ta.style.opacity ="0"
 document.body.appendChild(ta)
 ta.select()
 try {
 document.execCommand("copy")
 } catch {
 /* nothing else to try — the value is still on screen to select */
 }
 document.body.removeChild(ta)
 }
 setDone(true)
 window.setTimeout(() => setDone(false), 1600)
 }

 return (
 <button
 type="button"
 onClick={copy}
 className="whitespace-nowrap rounded-md border border-line px-2 py-1 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-ink-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-teal"
 >
 {done ?"Copied" : label}
 </button>
 )
}
