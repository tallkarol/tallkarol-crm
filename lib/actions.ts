"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { destroySession } from "@/lib/auth"
import { SESSION_COOKIE } from "@/lib/crypto"

export async function logoutAction() {
  await destroySession()
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  redirect("/login")
}
