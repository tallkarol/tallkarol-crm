"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

/**
 * The chat's own frame inside the CRM shell: a thread rail on the left that
 * never scrolls away, and a column on the right that fills the rest. The
 * shell hands this route a flex column the height of the window (see
 * FULL_BLEED in AppShell), so nothing here measures the viewport.
 *
 * Under `md` the rail becomes a drawer the header button opens — the same
 * shape as the shell's own mobile nav, so the two sidebars behave alike.
 */

const FrameContext = createContext<{
  open: boolean
  setOpen: (open: boolean) => void
}>({ open: false, setOpen: () => {} })

export function useChatFrame() {
  return useContext(FrameContext)
}

export function ChatFrame({
  routeKey,
  sidebar,
  children,
}: {
  /** Changes when the thread does; the drawer closes on navigation. */
  routeKey: string
  sidebar: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [routeKey])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <FrameContext.Provider value={{ open, setOpen }}>
      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label="Threads and skills"
          className="hidden w-[18rem] shrink-0 flex-col border-r border-line bg-card md:flex"
        >
          {sidebar}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>

        {open ? (
          <div className="absolute inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-scrim"
              aria-label="Close threads"
              onClick={() => setOpen(false)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Threads and skills"
              className="relative flex h-full w-[min(20rem,88vw)] flex-col bg-card shadow-overlay"
            >
              {sidebar}
            </aside>
          </div>
        ) : null}
      </div>
    </FrameContext.Provider>
  )
}
