import { NextRequest, NextResponse } from "next/server"
import { requestMagicLink } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === "string" ? body.email : ""
    await requestMagicLink(email, { app: body?.app === true })
    return NextResponse.json({
      ok: true,
      message: "If that email is allowed, a sign-in link is on its way.",
    })
  } catch (err) {
    console.error("auth/request error:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
