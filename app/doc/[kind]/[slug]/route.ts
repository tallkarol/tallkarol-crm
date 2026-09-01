import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { proposals, reports, worksheets } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { readDocHtml } from "@/lib/docs"

export const dynamic = "force-dynamic"

const KINDS = new Set(["reports", "proposals", "worksheets"])

export async function GET(
  request: Request,
  { params }: { params: { kind: string; slug: string } }
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (!KINDS.has(params.kind) || !/^[a-z0-9-]+$/.test(params.slug)) {
    return new NextResponse("Not found", { status: 404 })
  }

  const row =
    params.kind === "reports"
      ? await db.query.reports.findFirst({ where: eq(reports.slug, params.slug) })
      : params.kind === "worksheets"
        ? await db.query.worksheets.findFirst({
            where: eq(worksheets.slug, params.slug),
          })
        : await db.query.proposals.findFirst({
            where: eq(proposals.slug, params.slug),
          })

  if (!row?.bodyPath) return new NextResponse("Not found", { status: 404 })

  const html = readDocHtml(row.bodyPath)
  if (!html) return new NextResponse("Document file is missing.", { status: 404 })

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
