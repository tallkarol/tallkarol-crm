"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

/**
 * The chat's own frame inside the CRM shell: the queue on the left that
 * never scrolls away, the thread in the middle filling the rest, and the
 * context panel on the right when there is a thread to describe. The shell
 * hands this route a flex column the height of the window (see FULL_BLEED
 * in AppShell), so nothing here measures the viewport.
 *
 * Under `md` the queue becomes a drawer the header button opens — the same
 * shape as the shell's own mobile nav, so the two sidebars behave alike.
 * The context panel only exists from `xl` up; below that the receipt strips
 * carry what it says.
 */

const CONTEXT_KEY = "tk-chat-context"

const FrameContext = createContext<{
  open: boolean
  setOpen: (open: boolean) => void
  contextOpen: boolean
  setContextOpen: (open: boolean) => void
}>({ open: false, setOpen: () => {}, contextOpen: true, setContextOpen: () => {} })

export function useChatFrame() {
  return useContext(FrameContext)
}

export function ChatFrame({
  routeKey,
  sidebar,
  context,
  children,
}: {
  /** Changes when the thread does; the drawer closes on navigation. */
  routeKey: string
  sidebar: ReactNode
  /** Null on a thread that has not started — there is nothing to describe yet. */
  context: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [contextOpen, setContextOpenState] = useState(true)

  useEffect(() => {
    setOpen(false)
  }, [routeKey])

  useEffect(() => {
    try {
      if (localStorage.getItem(CONTEXT_KEY) === "closed") setContextOpenState(false)
    } catch {
      /* ignore */
    }
  }, [])

  function setContextOpen(next: boolean) {
    setContextOpenState(next)
    try {
      localStorage.setItem(CONTEXT_KEY, next ? "open" : "closed")
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <FrameContext.Provider value={{ open, setOpen, contextOpen, setContextOpen }}>
      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label="Requests and skills"
          className="hidden w-[18rem] shrink-0 flex-col border-r border-line bg-canvas md:flex"
        >
          {sidebar}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">{children}</section>

        {context && contextOpen ? (
          <aside
            aria-label="Context"
            className="hidden w-[19.5rem] shrink-0 flex-col border-l border-line bg-canvas xl:flex"
          >
            {context}
          </aside>
        ) : null}

        {open ? (
          <div className="absolute inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-scrim"
              aria-label="Close requests"
              onClick={() => setOpen(false)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Requests and skills"
              className="relative flex h-full w-[min(20rem,88vw)] flex-col bg-canvas shadow-overlay"
            >
              {sidebar}
            </aside>
          </div>
        ) : null}
      </div>
    </FrameContext.Provider>
  )
}
