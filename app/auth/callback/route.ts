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

  // A link requested from the native app. Hand the token to the app rather
  // than consuming it here: this page is in the browser, and the browser's
  // cookies are not the app's. The app then loads this same route, without
  // `app=1`, inside its own web view, and the cookie lands where it is used.
  if (request.nextUrl.searchParams.get("app") === "1") {
    return new NextResponse(appHandoffPage(token), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    })
  }

  try {
    const result = await consumeMagicLink(token)
    if (!result) {
      return NextResponse.redirect(new URL("/login?error=invalid", appUrl))
    }

    // Customers have no CRM to land on: the admin layout bounces any
    // non-admin to /login, so sending everyone to "/" made a successful
    // portal sign-in end back on the login form, looking like a failure.
    const home = result.user.role === "admin" ? "/" : "/portal"

    const res = NextResponse.redirect(new URL(home, appUrl))
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

function appHandoffPage(token: string) {
  // Tokens are hex, but escape anyway: this lands in an attribute and a script.
  const safe = token.replace(/[^A-Za-z0-9]/g, "")
  const scheme = `tallkarol://auth?token=${safe}`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Open TallKarol</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font:15px/1.5 -apple-system,system-ui,sans-serif;background:#F1EADC;color:#0F1615;
       display:grid;place-items:center;min-height:100vh;margin:0}
  main{text-align:center;max-width:26rem;padding:2rem}
  a{display:inline-block;margin-top:1rem;padding:.7rem 1.2rem;border-radius:.6rem;
    background:#006965;color:#F1EADC;text-decoration:none;font-weight:600}
  p{color:#5a6664;font-size:13px}
</style></head><body><main>
  <h1>Opening TallKarol…</h1>
  <p>If nothing happens, the app is not installed on this Mac, or the link was opened somewhere else.</p>
  <a href="${scheme}">Open TallKarol</a>
</main>
<script>location.replace(${JSON.stringify(scheme)})</script>
</body></html>`
}
