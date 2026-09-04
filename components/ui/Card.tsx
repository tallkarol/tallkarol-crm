import type { ElementType, ReactNode } from "react"
import { cn } from "@/lib/cn"

/**
 * The one card recipe.
 *
 * 278 call sites across 126 files re-declared this shell inline, which is how
 * one border weight drifted into fifteen alpha rungs before the sweep. The
 * shell lives here now so the next screen cannot invent a sixteenth.
 *
 * Deliberately NOT opinionated about padding. Roughly a third of the shells
 * this replaces set their own (`px-5 pt-3.5`, `p-4`, none at all because a
 * table draws to the edge), so a default here would silently reflow them. Pass
 * padding through className like any other layout concern.
 *
 * `cn()` is a plain filter-and-join with no tailwind-merge, so a className
 * passed in does NOT override a base class — it lands alongside it and
 * stylesheet order decides. That is why `surface` and `radius` are props
 * rather than something you fix up from the outside.
 */

type Surface = "card" | "well" | "bare"
type Radius = "lg" | "xl" | "2xl"
type Elevation = "card" | "overlay" | "none"

const SURFACE: Record<Surface, string> = {
  /** A panel resting on the canvas. */
  card: "border border-line bg-card",
  /** An inset: a board column, a toolbar, a footer strip. In dark the well is
   *  LIGHTER than the card, which is what makes the ramp read at all. */
  well: "border border-line bg-well",
  /** Structure only — the caller paints. */
  bare: "",
}

const RADIUS: Record<Radius, string> = { lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" }

const ELEVATION: Record<Elevation, string> = {
  card: "shadow-card",
  /** Modals, drawers, popovers and command palettes, which float over a scrim
   *  rather than resting on the page. In dark this token's 7% linen hairline
   *  is what actually cuts the panel out — a black shadow at alpha 1.0 tops
   *  out at 1.1456:1 over the canvas, less than the card's own surface step. */
  overlay: "shadow-overlay",
  none: "",
}

/**
 * The hover recipe from the mockup: motion is the affordance, not the shadow.
 * A black shadow cannot lift a card off #0F1615, so what moves is the border
 * weight, the 1px linen top edge inside --shadow-hover, and 2px of travel.
 *
 * One class per array entry so the Tailwind content scanner sees each one
 * plainly — these classes exist ONLY in this file now, so if the scanner
 * missed them every card in the app would render unstyled with no build error.
 * Verified against the emitted stylesheet rather than assumed.
 *
 * `transition` rather than an arbitrary property list: Tailwind's own
 * `transition` already covers transform, box-shadow and border-color, which is
 * exactly the set that moves here.
 */
const INTERACTIVE = [
  "transition",
  "duration-150",
  "hover:-translate-y-0.5",
  "hover:border-line-strong",
  "hover:shadow-hover",
  "motion-reduce:transition-none",
  "motion-reduce:hover:translate-y-0",
].join(" ")

export function Card<T extends ElementType = "div">({
  as,
  surface = "card",
  radius = "2xl",
  elevation = "card",
  interactive = false,
  className,
  children,
  ...rest
}: {
  /** Render as something else — `section`, `a`, `li`, `button`. */
  as?: T
  surface?: Surface
  radius?: Radius
  elevation?: Elevation
  /** Adds the hover lift. Use on cards that navigate or open something. */
  interactive?: boolean
  className?: string
  children?: ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, "className" | "children">) {
  const Tag = (as ?? "div") as ElementType
  return (
    <Tag
      className={cn(
        RADIUS[radius],
        SURFACE[surface],
        ELEVATION[elevation],
        interactive && INTERACTIVE,
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
