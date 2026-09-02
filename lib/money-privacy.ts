/**
 * Demo mode: hide every money figure.
 *
 * One cookie (`tk_hide_money=1`, this browser only) turns every currency
 * amount in the CRM into `$••••`. It is per device on purpose — flipping it
 * on the laptop that is projecting a demo must not mask invoices for a client
 * reading the portal on their own phone, and per-request state is the shape a
 * per-tenant setting takes later, with no schema.
 *
 * The switch is consulted inside the shared formatters (`formatMoney`,
 * `formatWholeMoney`, `formatAxisMoney`, `fmtMoney`) rather than at ~200
 * call sites, so `hideMoney()` has to be a plain synchronous function that
 * works in three places that cannot share state:
 *
 *  1. Server components and server-side lib code (the RSC layer). A resolver
 *     registered by `lib/money-privacy-server.ts` reads the cookie through
 *     `next/headers`, which is AsyncLocalStorage-backed — per request, with
 *     no dependency on which component rendered first.
 *  2. The server pass of client components (the SSR layer). `next/headers`
 *     is not importable there and React's `cache()` throws, so `AppShell`
 *     primes a module-level flag from a prop at the top of its render. Fizz
 *     renders parents before children, so every client component under the
 *     shell reads the primed value. Same trick as `lib/client-colors.ts`.
 *  3. The browser. The admin layout emits an inline script that sets a window
 *     global before hydration, so the first client render agrees with the
 *     server HTML and nothing flashes or mismatches.
 *
 * All three derive from the same cookie in the same request. The one residual
 * risk is layer 2: the flag is process-global, so two browsers with different
 * cookie states rendering in the same tick could cross-contaminate client
 * components' SSR HTML. Acceptable for a single-operator CRM; a multi-tenant
 * build moves that layer to a per-request store and nothing else changes.
 *
 * This module has no imports so it is safe in client bundles and in the tsx
 * scripts under `scripts/` that import `lib/attention.ts`.
 */

export const HIDE_MONEY_COOKIE = "tk_hide_money"
export const HIDE_MONEY_GLOBAL = "__TK_HIDE_MONEY__"
export const MASK_DIGITS = "••••"

let serverFlag = false
let resolver: (() => boolean) | null = null

/** Server-only module registers the cookie reader; RSC layer only. */
export function registerHideMoneyResolver(fn: () => boolean) {
  resolver = fn
}

/** Client shells call this first thing in render so the SSR pass agrees. */
export function primeHideMoney(on: boolean) {
  serverFlag = on
}

export function hideMoney(): boolean {
  if (typeof window !== "undefined") {
    return (window as unknown as Record<string, unknown>)[HIDE_MONEY_GLOBAL] === true
  }
  if (resolver) {
    try {
      return resolver()
    } catch {
      // Outside a request scope (route handler, cron script): fall through.
    }
  }
  return serverFlag
}

const symbols = new Map<string, string>()

/** `$` for USD, `€` for EUR — the prefix the mask keeps so it still reads as money. */
export function currencySymbol(currency = "USD") {
  const cached = symbols.get(currency)
  if (cached) return cached
  let symbol: string
  try {
    symbol = (0)
      .toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
      .replace(/[\d\s.,]/g, "")
  } catch {
    symbol = currency
  }
  symbols.set(currency, symbol)
  return symbol
}

export function maskedMoney(currency = "USD") {
  return `${currencySymbol(currency)}${MASK_DIGITS}`
}
