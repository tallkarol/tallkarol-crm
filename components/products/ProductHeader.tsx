import { ClientAvatar } from "@/components/clients/ClientAvatar"
import { AskDeskButton } from "@/components/clients/AskDeskButton"
import { StatusSelect } from "@/app/(admin)/products/StatusSelect"
import type { ProductShell } from "@/lib/product-rooms"

/** The header every product room shares: which product, its status, and the desk. */
export function ProductHeader({ product }: { product: ProductShell }) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5 sm:px-5">
      <ClientAvatar name={product.name} slug={product.slug} size="md" />
      <h1 className="flex min-w-0 flex-1 items-baseline gap-2 font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-tk-onyx">
        <span className="min-w-0 truncate">{product.name}</span>
        {product.tagline ? (
          <span className="hidden min-w-0 truncate font-ui text-xs font-medium tracking-normal text-ink-3 md:inline">{product.tagline}</span>
        ) : null}
      </h1>
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusSelect productId={product.id} status={product.status as Parameters<typeof StatusSelect>[0]["status"]} />
        <AskDeskButton monogram="PO" />
      </div>
    </header>
  )
}
