"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, MessageSquare } from "lucide-react"
import { cn } from "@/lib/cn"
import { markColor } from "@/lib/client-colors"
import { DESK_OPEN_EVENT } from "@/lib/chat/desk-context"
import { PRODUCT_ROOMS, ROUTES, productRoomOf } from "@/lib/nav"
import { navIcon } from "@/lib/nav-icons"
import type { ProductPanelData, ProductShell } from "@/lib/product-rooms"

const ROW =
  "flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 font-ui text-[13px] leading-[19px] transition-colors"

/**
 * The dock panel in product mode — the client panel's shape: who, this
 * product's rooms, the product-owner desk, the other products, and a way
 * back to all of them.
 */
export function ProductPanel({ product, data }: { product: ProductShell; data: ProductPanelData }) {
  const pathname = usePathname()
  const room = productRoomOf(pathname)
  const others = data.roster.filter((p) => p.slug !== product.slug)
  return (
    <aside
      aria-label={`${product.name} panel`}
      data-chrome="sidebar"
      className="hidden w-[236px] shrink-0 flex-col gap-2.5 border-r border-rail-line bg-rail-2 px-3 py-4 rail:flex"
    >
      <div className="flex items-center gap-2.5 rounded-[10px] border border-rail-line bg-rail px-2.5 py-2">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg font-ui text-[11px] font-extrabold text-tk-linen"
          style={{ background: markColor(product.color) }}
        >
          {product.short}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-ui text-[13px] font-bold text-rail-ink">{product.name}</span>
          <span className="block truncate font-ui text-[11px] text-rail-ink-3">
            {[product.statusLabel, product.studio].filter(Boolean).join(" · ")}
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-0.5">
        {PRODUCT_ROOMS.map((r) => {
          const active = r.id === room
          const Icon = navIcon(r.icon)
          const count = r.id === "board" ? data.badges.board : r.id === "punchlists" ? data.badges.punchlists : 0
          return (
            <li key={r.id}>
              <Link
                href={ROUTES.productRoom(product.slug, r.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  ROW,
                  active ? "bg-[--rail-active] font-semibold text-white" : "text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-[--rail-active-icon]" : "text-rail-ink/50")} strokeWidth={active ? 2.25 : 2} />
                  <span className="truncate">{r.label}</span>
                </span>
                {count > 0 ? (
                  <span className="grid h-[18px] min-w-5 place-items-center rounded-full bg-accent px-1.5 font-ui text-[10.5px] font-bold text-tk-linen">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="px-2.5 pt-1.5 font-ui text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-rail-ink-3">Desks</p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(DESK_OPEN_EVENT))}
        className="flex w-full items-center gap-2.5 rounded-[10px] border border-dashed border-rail-line px-2.5 py-[7px] text-left font-ui text-xs text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-rail-line bg-rail font-ui text-[9px] font-extrabold text-[--rail-active-icon]">PO</span>
        <span className="flex-1">Product owner</span>
        <MessageSquare aria-hidden className="size-3.5 text-rail-ink/50" />
      </button>

      <div className="mt-auto flex flex-col gap-0.5">
        {others.length > 0 ? (
          <>
            <p className="px-2.5 pb-1 font-ui text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-rail-ink-3">Other products</p>
            {others.map((p) => (
              <Link key={p.slug} href={ROUTES.productPage(p.slug)} className={cn(ROW, "text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink")}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: markColor(p.color) }} />
                  <span className="truncate">{p.name}</span>
                </span>
              </Link>
            ))}
          </>
        ) : null}
        <Link
          href={ROUTES.products}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 font-ui text-[13px] leading-[19px] text-rail-ink-2 transition-colors hover:bg-rail-hover hover:text-rail-ink"
        >
          <ArrowLeft aria-hidden className="size-4 text-rail-ink/50" />
          All products
        </Link>
      </div>
    </aside>
  )
}
