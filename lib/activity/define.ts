/**
 * What an activity module declares. PURE — the ingest route, the /activity
 * page, scripts/check-activity.ts and the scanner all import this, and the
 * probe's bundle must never reach the database driver through it.
 *
 * A module owns event kinds, and a kind owns the only props it may carry.
 * Ingest drops every key a kind does not declare and counts the drop, so a
 * careless `track()` call cannot quietly start storing something new: adding
 * a field is an edit here, visible in review.
 */

export type ModuleKey =
  | "pages"
  | "navigation"
  | "controls"
  | "peeks"
  | "actions"
  | "errors"
  | "vitals"
  | "frustration"
  | "devices"
  | "portal"

export type PropSpec =
  /** Free text the CRM itself wrote (an action's message, an error line). Never user input. */
  | { type: "string"; max: number }
  | { type: "enum"; values: readonly string[] }
  | { type: "number"; min?: number; max?: number }
  | { type: "boolean" }
  /** A pathname from the browser, stored as its route pattern. */
  | { type: "route" }
  /** Route params ({ slug: "dqs" }): at most four, 80 characters each. */
  | { type: "params" }

export type KindSpec = {
  /** One line for the Stream and ACTIVITY.md. */
  label: string
  props: Record<string, PropSpec>
  /** durationMs means something on this kind. */
  duration?: boolean
  /** The kind reports success or failure in `ok`. */
  outcome?: boolean
  /** The kind names a control, an action or an element in `target`. */
  target?: boolean
  /** Written by the server only — refused when a browser sends it. */
  serverOnly?: boolean
}

export type ActivityModule = {
  key: ModuleKey
  label: string
  /** What it records, in the words the Modules tab uses. */
  description: string
  /** Where the capture lives in the code. */
  capturedBy: string
  /** On until someone switches it off. */
  defaultOn: boolean
  /** false: listed, but nothing exists to switch on yet. */
  available: boolean
  kinds: Record<string, KindSpec>
}

export function defineModule<M extends ActivityModule>(module: M): M {
  return module
}
