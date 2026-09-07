/**
 * How the sidebar talks to the composer.
 *
 * The Skills tab and the empty-thread starters live in different client
 * trees from the textarea, and lifting their state to a common parent would
 * mean the whole page re-rendering for every keystroke. A window event is
 * the same mechanism the dashboard uses for the left-off board
 * (`tk:leftoff-open`), so it is one idiom, not a second one.
 */

export type ComposeRequest = {
  text: string
  /** Send as it is. Otherwise drop into the composer and select the first blank. */
  send?: boolean
}

const COMPOSE = "tk:chat-compose"
const SKILLS_TAB = "tk:chat-skills"

export function requestCompose(request: ComposeRequest) {
  window.dispatchEvent(new CustomEvent<ComposeRequest>(COMPOSE, { detail: request }))
}

export function onCompose(handler: (request: ComposeRequest) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<ComposeRequest>).detail)
  window.addEventListener(COMPOSE, listener)
  return () => window.removeEventListener(COMPOSE, listener)
}

/** "All 17 →" on the empty thread: show the Skills tab. */
export function requestSkillsTab() {
  window.dispatchEvent(new Event(SKILLS_TAB))
}

export function onSkillsTab(handler: () => void): () => void {
  window.addEventListener(SKILLS_TAB, handler)
  return () => window.removeEventListener(SKILLS_TAB, handler)
}
