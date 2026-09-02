/**
 * A one-line event bus for "a punch just started or stopped".
 *
 * The floating clock polls the server on a slow interval; anything in the
 * browser that changes a punch itself announces it here so the pill catches
 * up immediately instead of on the next tick.
 */
const EVENT = "tk:punch-change"

export function announcePunchChange() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(EVENT))
}

export function onPunchChange(listener: () => void) {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
