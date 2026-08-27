import { NextRequest, NextResponse } from "next/server"
import {
  consumeMagicLink,
  sessionCookieOptions,
} from "@/lib/auth"
import { SESSION_COOKIE } from "@/lib/crypto"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  const appUrl = process.env.APP_URL || "http://localhost:3001"

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
