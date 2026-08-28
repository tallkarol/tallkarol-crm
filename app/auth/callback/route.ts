import { NextRequest, NextResponse } from "next/server"
import {
  consumeMagicLink,
  sessionCookieOptions,
} from "@/lib/auth"
import { SESSION_COOKIE } from "@/lib/crypto"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  // Land on the host the request actually arrived at. The session cookie is
  // set on that host, so redirecting anywhere else drops it and the sign-in
  // silently fails — which is what happens when APP_URL names a different
  // domain than the one the link was opened on.
  const appUrl = request.nextUrl.origin

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
