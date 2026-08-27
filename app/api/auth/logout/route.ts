import { NextResponse } from "next/server"
import { destroySession } from "@/lib/auth"
import { SESSION_COOKIE } from "@/lib/crypto"

export async function POST() {
  await destroySession()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return res
}
