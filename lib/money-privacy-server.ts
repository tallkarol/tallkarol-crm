import { cookies } from "next/headers"
import { HIDE_MONEY_COOKIE, registerHideMoneyResolver } from "@/lib/money-privacy"

/**
 * The RSC-layer half of demo mode — see `lib/money-privacy.ts` for the whole
 * picture. Importing this module anywhere in a server tree registers the
 * cookie reader, so every server component and lib call in that request
 * masks without threading anything through props.
 */
export function readHideMoneyCookie(): boolean {
  try {
    return cookies().get(HIDE_MONEY_COOKIE)?.value === "1"
  } catch {
    // `cookies()` outside a request scope — route handlers and scripts.
    return false
  }
}

registerHideMoneyResolver(readHideMoneyCookie)
