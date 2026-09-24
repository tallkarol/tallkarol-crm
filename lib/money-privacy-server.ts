import { cookies, type UnsafeUnwrappedCookies } from "next/headers"
import { HIDE_MONEY_COOKIE, registerHideMoneyResolver } from "@/lib/money-privacy"

/**
 * The RSC-layer half of demo mode — see `lib/money-privacy.ts` for the whole
 * picture. Importing this module anywhere in a server tree registers the
 * cookie reader, so every server component and lib call in that request
 * masks without threading anything through props.
 */
export async function readHideMoneyCookie(): Promise<boolean> {
  try {
    return (await cookies()).get(HIDE_MONEY_COOKIE)?.value === "1"
  } catch {
    // `cookies()` outside a request scope — route handlers and scripts.
    return false
  }
}

/**
 * The resolver behind `hideMoney()`, which the money formatters call
 * synchronously (~200 call sites). Next 15 made `cookies()` async but still
 * allows reading it synchronously during the transition; this is the one
 * place that does. Next 16 removes that — the CRM task "request-scoped
 * hideMoney()" replaces this with a value primed from an awaited read.
 */
function readHideMoneyCookieSync(): boolean {
  try {
    return (cookies() as unknown as UnsafeUnwrappedCookies).get(HIDE_MONEY_COOKIE)?.value === "1"
  } catch {
    return false
  }
}

registerHideMoneyResolver(readHideMoneyCookieSync)
