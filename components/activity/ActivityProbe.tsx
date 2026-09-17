"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useReportWebVitals } from "next/web-vitals"
import { useCallback, useEffect, useRef } from "react"
import { flushActivity, startActivity, track, type ProbeModules } from "@/lib/activity/client"
import {
  ABANDON_GRACE_MS,
  ACTIVE_INPUT_MS,
  ACTIVE_SLICE_MS,
  createFlipFlopDetector,
  createRageDetector,
  fingerprint,
  isQuickBack,
} from "@/lib/activity/detect"

/**
 * Records how the CRM is used. Renders nothing; mounted once in the admin
 * layout and once in the portal layout. What it listens for, and why each
 * rule is what it is, is in ACTIVITY.md and lib/activity/detect.ts.
 *
 * Every listener is passive and on the document, so no component imports
 * anything to be measured. A module switched off is checked at the moment an
 * event would be recorded, and ingest drops it again if a stale tab sends it.
 */

type Via = "sidebar" | "palette" | "link" | "peek" | "back" | "outside" | "reload" | "other"

const TICK_MS = 5000
/**
 * How long the thing that caused a navigation stays its cause. The route only
 * changes once the server render arrives, which can take seconds, so the
 * cause is remembered when it happens rather than guessed when the page
 * lands. A link, a sidebar row, ⌘K, a peek card or Back is a strong cause; a
 * plain button that might router.push is a weak one.
 */
const INTENT_MS = { strong: 30_000, weak: 10_000 }
const VITALS = ["lcp", "inp", "cls", "fcp", "ttfb"]

/** Where a click happened, by region — never by label, so no record names are stored. */
function regionOf(el: Element): { via: Via; chars?: number } {
  if (el.closest('[data-chrome="sidebar"], #tk-crm-mobile-nav')) return { via: "sidebar" }
  const palette = el.closest('[data-nav="palette"]')
  if (palette) return { via: "palette", chars: palette.querySelector("input")?.value.length ?? 0 }
  if (el.closest('[data-nav="peek"]')) return { via: "peek" }
  return { via: "link" }
}

/** A data-track id, or the region and element type. Never an aria-label: those carry client names. */
function elementName(el: Element): string {
  const tracked = el.closest<HTMLElement>("[data-track]")?.dataset.track
  if (tracked) return tracked
  const region = el.closest('[data-chrome="sidebar"]')
    ? "sidebar"
    : el.closest('[data-nav="palette"]')
      ? "palette"
      : el.closest('[data-nav="peek"]')
        ? "peek"
        : "page"
  const interactive = el.closest("button, a, input, select, textarea, [role]")
  const node = interactive ?? el
  const role = node.getAttribute("role")
  return `${region} › ${node.tagName.toLowerCase()}${role ? `[${role}]` : ""}`
}

const isFormish = (el: Element) => /^(INPUT|SELECT|TEXTAREA|FORM)$/.test(el.tagName)

const textFields = 'input:not([type]), input[type="text"], input[type="search"], textarea'

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Chunk hashes change every deploy; the same bug should not become a new row each time. */
function stableSource(source: string) {
  return source.replace(/^https?:\/\/[^/]+/, "").replace(/[0-9a-f]{8,}/gi, "*").slice(0, 160)
}

export function ActivityProbe({ modules }: { modules: ProbeModules }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const peek = search.get("peek")
  const mods = useRef(modules)
  mods.current = modules

  const s = useRef({
    first: true,
    view: "",
    viewPath: "",
    viewAt: 0,
    active: 0,
    lastSlice: 0,
    lastInput: Date.now(),
    intent: null as null | { at: number; via: Via; chars?: number; strong: boolean },
    pending: null as null | { path: string; via: Via; startedAt: number; view: string },
    peek: null as null | { raw: string; type: string; at: number; acted: boolean },
  })

  const leave = useCallback((reason: "navigate" | "hidden" | "tick" | "close") => {
    const st = s.current
    if (!st.view || st.active <= 0) return
    if (mods.current.pages) {
      track("page.leave", { path: st.viewPath, durationMs: st.active, props: { view: st.view, reason } })
    }
    st.active = 0
    st.lastSlice = Date.now()
  }, [])

  useEffect(() => {
    startActivity(modules)
  }, [modules])

  /* ------------------------------------------------------------ listeners */
  useEffect(() => {
    const st = s.current
    const rage = createRageDetector()
    const flip = createFlipFlopDetector()
    const sentAt = new WeakMap<Element, number>()
    const selectFrom = new WeakMap<Element, string>()

    const touched = () => {
      st.lastInput = Date.now()
    }

    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (!el) return
      const now = Date.now()
      st.lastInput = now
      const region = regionOf(el)
      st.intent = { at: now, ...region, strong: region.via !== "link" || Boolean(el.closest("a[href]")) }
      if (st.peek && el.closest('[data-nav="peek"]') && el.closest('button, [type="submit"]')) st.peek.acted = true

      const control = el.closest<HTMLElement>("[data-track]")
      if (control && !isFormish(control) && mods.current.controls) {
        const id = control.dataset.track ?? ""
        const value = control.dataset.trackValue
        track("control.use", { target: id, props: value ? { value } : undefined })
        if (value && mods.current.frustration) {
          const flop = flip(id, value, now, control.dataset.trackFrom)
          if (flop) track("frustration.flipflop", { target: id, props: flop })
        }
      }
      if (mods.current.frustration) {
        const name = elementName(el)
        const clicks = rage(name, now, e.clientX, e.clientY)
        if (clicks) track("frustration.rage", { target: name, props: { clicks } })
      }
    }

    const onKey = (e: KeyboardEvent) => {
      st.lastInput = Date.now()
      if (e.key !== "Enter" || !(e.target instanceof Element)) return
      const palette = e.target.closest('[data-nav="palette"]')
      if (palette) st.intent = { at: Date.now(), via: "palette", chars: palette.querySelector("input")?.value.length ?? 0, strong: true }
    }

    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLSelectElement) selectFrom.set(e.target, e.target.value)
    }

    const onChange = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement) || !mods.current.controls) return
      const control = el.closest<HTMLElement>("[data-track]")
      if (!control) return
      const id = control.dataset.track ?? ""
      let value: string | null = null
      if (el instanceof HTMLSelectElement) value = el.value
      else if (el instanceof HTMLInputElement && el.type === "checkbox") value = String(el.checked)
      else if (el instanceof HTMLInputElement && el.type === "radio") value = el.value
      if (value === null) return
      track("control.use", { target: id, props: { value } })
      if (mods.current.frustration) {
        const flop = flip(id, value, Date.now(), el instanceof HTMLSelectElement ? selectFrom.get(el) : undefined)
        if (flop) track("frustration.flipflop", { target: id, props: flop })
        if (el instanceof HTMLSelectElement) selectFrom.set(el, value)
      }
    }

    const onSubmit = (e: Event) => {
      const form = e.target instanceof HTMLFormElement ? e.target : null
      if (!form) return
      sentAt.set(form, Date.now())
      const control = form.closest<HTMLElement>("[data-track]") ?? form.querySelector<HTMLElement>("[data-track]")
      if (!control || !mods.current.controls) return
      const chars = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(textFields)).reduce(
        (n, field) => n + field.value.length,
        0
      )
      track("control.use", { target: control.dataset.track ?? "", props: { chars, sent: true } })
    }

    const onFocusOut = (e: FocusEvent) => {
      const field = e.target
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return
      if (!field.matches(textFields) || !field.value.length || !mods.current.frustration) return
      const control = field.closest<HTMLElement>("[data-track]")
      if (!control) return
      const leftAt = Date.now()
      window.setTimeout(() => {
        if (!field.isConnected || document.activeElement === field || !field.value.length) return
        if (field.form && (sentAt.get(field.form) ?? 0) >= leftAt - 100) return
        track("frustration.abandon", { target: control.dataset.track ?? "", props: { chars: field.value.length } })
      }, ABANDON_GRACE_MS)
    }

    const onPop = () => {
      st.intent = { at: Date.now(), via: "back", strong: true }
    }

    const onError = (e: ErrorEvent) => {
      if (!mods.current.errors) return
      const message = (e.message || "Error").split("\n")[0].slice(0, 200)
      if (/ResizeObserver loop/.test(message) || /^(chrome|moz|safari)-extension:/.test(e.filename ?? "")) return
      const source = e.filename ? stableSource(`${e.filename}:${e.lineno}`) : ""
      track("error.client", { props: { message, source, fingerprint: fingerprint(`${message}|${source}`) } })
    }

    const onRejection = (e: PromiseRejectionEvent) => {
      if (!mods.current.errors) return
      const reason = e.reason instanceof Error ? e.reason : null
      const message = (reason?.message ?? String(e.reason)).split("\n")[0].slice(0, 200)
      const source = stableSource(reason?.stack?.split("\n")[1]?.trim() ?? "")
      track("error.client", { props: { message, source, fingerprint: fingerprint(`${message}|${source}`) } })
    }

    const onHide = () => {
      if (document.visibilityState !== "hidden") return
      leave("hidden")
      flushActivity()
    }

    const onPageHide = () => {
      leave("close")
      flushActivity()
    }

    const opts = { capture: true, passive: true } as const
    document.addEventListener("click", onClick, opts)
    document.addEventListener("keydown", onKey, opts)
    document.addEventListener("focusin", onFocusIn, opts)
    document.addEventListener("focusout", onFocusOut, opts)
    document.addEventListener("change", onChange, opts)
    document.addEventListener("submit", onSubmit, opts)
    document.addEventListener("pointerdown", touched, opts)
    document.addEventListener("wheel", touched, opts)
    document.addEventListener("scroll", touched, opts)
    document.addEventListener("touchstart", touched, opts)
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("popstate", onPop)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)

    const timer = window.setInterval(() => {
      const now = Date.now()
      if (document.visibilityState === "visible" && document.hasFocus() && now - st.lastInput < ACTIVE_INPUT_MS) {
        st.active += TICK_MS
      }
      if (st.active > 0 && now - st.lastSlice >= ACTIVE_SLICE_MS) leave("tick")
    }, TICK_MS)

    return () => {
      document.removeEventListener("click", onClick, opts)
      document.removeEventListener("keydown", onKey, opts)
      document.removeEventListener("focusin", onFocusIn, opts)
      document.removeEventListener("focusout", onFocusOut, opts)
      document.removeEventListener("change", onChange, opts)
      document.removeEventListener("submit", onSubmit, opts)
      document.removeEventListener("pointerdown", touched, opts)
      document.removeEventListener("wheel", touched, opts)
      document.removeEventListener("scroll", touched, opts)
      document.removeEventListener("touchstart", touched, opts)
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
      window.clearInterval(timer)
    }
  }, [leave])

  /* ------------------------------------------------------------ page views */
  useEffect(() => {
    const st = s.current
    const now = Date.now()

    // A view not yet sent for this same path is the same view: React runs
    // effects twice on mount in development, and the rerun must not turn
    // "from outside" into an unexplained navigation.
    if (!st.pending || st.pending.path !== pathname) {
      let via: Via
      let startedAt: number
      if (st.first) {
        st.first = false
        const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
        const sameSite = document.referrer.startsWith(window.location.origin)
        via = entry?.type === "reload" ? "reload" : entry?.type === "back_forward" ? "back" : sameSite ? "link" : "outside"
        startedAt = performance.timeOrigin
      } else {
        const intent = st.intent
        if (intent && now - intent.at < (intent.strong ? INTENT_MS.strong : INTENT_MS.weak)) {
          via = intent.via
          startedAt = intent.at
        } else {
          via = "other"
          startedAt = now
        }
        leave("navigate")
        // Measured to the Back press, not to when the previous page finally landed.
        const stayedMs = startedAt - st.viewAt
        if (mods.current.frustration && isQuickBack(via, stayedMs)) {
          track("frustration.quickback", { path: st.viewPath, props: { stayedMs, to: pathname } })
        }
        if (via === "palette") {
          track("nav.palette", { path: st.viewPath, props: { chars: st.intent?.chars ?? 0, to: pathname } })
        }
      }
      st.intent = null
      st.pending = { path: pathname, via, startedAt, view: Math.random().toString(36).slice(2, 12) }
      st.view = st.pending.view
      st.viewPath = pathname
      st.viewAt = now
      st.active = 0
      st.lastSlice = now
    }

    const pending = st.pending
    if (!pending) return
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        track("page.view", {
          path: pending.path,
          durationMs: Math.max(0, Date.now() - pending.startedAt),
          props: { view: pending.view, via: pending.via },
        })
        if (st.pending === pending) st.pending = null
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname, leave])

  /* ------------------------------------------------------------ peek cards */
  useEffect(() => {
    const st = s.current
    const now = Date.now()
    if (st.peek && st.peek.raw !== peek) {
      track("peek.close", { durationMs: now - st.peek.at, props: { peek: st.peek.type, acted: st.peek.acted } })
      st.peek = null
    }
    if (peek && !st.peek) {
      const i = peek.indexOf(":")
      const type = (i === -1 ? peek : peek.slice(0, i)).slice(0, 24)
      const id = i === -1 ? "" : safeDecode(peek.slice(i + 1)).slice(0, 80)
      st.peek = { raw: peek, type, at: now, acted: false }
      track("peek.open", { props: id ? { peek: type, id } : { peek: type } })
    }
  }, [peek])

  /* ------------------------------------------------------------ web vitals */
  const report = useCallback((metric: { name: string; value: number; rating?: string }) => {
    const name = metric.name.toLowerCase()
    if (!VITALS.includes(name)) return
    if (name === "cls") {
      track("vitals.cls", { props: { value: Math.round(metric.value * 1000) / 1000, rating: metric.rating } })
    } else {
      track(`vitals.${name}`, { durationMs: Math.round(metric.value), props: { rating: metric.rating } })
    }
  }, [])
  useReportWebVitals(report)

  return null
}
