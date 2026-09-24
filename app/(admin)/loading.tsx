import { BrandLoader } from "@/components/BrandLoader"

/**
 * Every admin page streams behind this: the dock, panel and desk dock stay
 * mounted and the page area shows the brand loader until the server render
 * lands. A search-param change on the same page (a peek, a filter) keeps the
 * old page up instead — verified on 14.2.35 — so cards never blank the page.
 * The nested layouts (timesheet, client rooms, insights, ads) carry their own
 * copy, because moving between their children never reaches this boundary.
 */
export default function Loading() {
  return <BrandLoader />
}
