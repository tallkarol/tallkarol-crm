import { RootHtml, rootMetadata, rootViewport } from "@/lib/root-html"
import "../globals.css"

/*
  The light-only root: the client portal, the sign-in page and the two print
  artifacts. It stamps light unconditionally and there is no way for a theme
  cookie to reach it, because Next forces a full document load when a
  navigation crosses between root layouts. That is the whole point of the
  split — see lib/root-html.tsx.
*/
export const metadata = rootMetadata
export const viewport = rootViewport

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <RootHtml theme="light">{children}</RootHtml>
}
