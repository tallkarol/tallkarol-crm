import { NextRequest, NextResponse } from "next/server"
import {
  consumeMagicLink,
  sessionCookieOptions,
} from "@/lib/auth"
import { SESSION_COOKIE } from "@/lib/crypto"

/**
 * The public origin this request came in on. Behind Railway's proxy
 * `nextUrl.origin` is the container's own address (localhost:8080), so the
 * forwarded headers are the only truthful source. Falling back to APP_URL
 * keeps a direct, unproxied request working.
 */
function publicOrigin(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (!host) return process.env.APP_URL || "http://localhost:3001"
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "")
  return `${proto}://${host}`
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  // Land on the host the link was opened on. The session cookie is set for
  // that host, so redirecting elsewhere drops it and sign-in silently fails.
  const appUrl = publicOrigin(request)

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing", appUrl))
  }

  try {
    const result = await consumeMagicLink(token)
    if (!result) {
      return NextResponse.redirect(new URL("/login?error=invalid", appUrl))
    }

    const res = NextResponse.redirect(new URL("/", appUrl))
    res.cookies.set(
      SESSION_COOKIE,
      result.sessionToken,
      sessionCookieOptions(result.expiresAt)
    )
    return res
  } catch (err) {
    console.error("auth callback error:", err)
    return NextResponse.redirect(new URL("/login?error=server", appUrl))
  }
}
