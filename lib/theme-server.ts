import { cookies } from "next/headers"
import { isTheme, THEME_COOKIE, type Theme } from "@/lib/theme"

/** The RSC half of appearance — see `lib/theme.ts`. */
export function readThemeCookie(): Theme {
  try {
    const raw = cookies().get(THEME_COOKIE)?.value
    return isTheme(raw) ? raw : "system"
  } catch {
    // `cookies()` outside a request scope — route handlers and scripts.
    return "system"
  }
}
