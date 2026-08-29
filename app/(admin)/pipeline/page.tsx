import { permanentRedirect } from "next/navigation"
import { ROUTES } from "@/lib/nav"

/**
 * The pipeline page became two pages: delivery (projects and retainers, which
 * is what this one had grown into) and leads (the sales board, which now has
 * room to be the whole surface). Old links land on delivery.
 */
export default function PipelinePage() {
  permanentRedirect(ROUTES.delivery)
}
