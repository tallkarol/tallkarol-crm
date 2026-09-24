"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ROUTES } from "@/lib/nav"
import { setPunchlistProductAction } from "@/lib/product-hub-actions"

/**
 * Files a punch list onto one of Karol's products, or back to its client
 * alone. The list's page lives in the product's hub when it has a product,
 * in the client's otherwise — so a change moves you to the new page.
 */
export function PunchlistProductSelect({
  list,
  products,
}: {
  list: { id: string; slug: string; clientSlug: string; productId: string | null }
  products: { id: string; name: string; slug: string }[]
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function change(productId: string | null) {
    setError(null)
    start(async () => {
      const result = await setPunchlistProductAction(list.id, productId)
      if (!result.ok) return setError(result.error)
      const product = products.find((p) => p.id === productId)
      router.push(product ? ROUTES.productPunchlist(product.slug, list.slug) : ROUTES.clientPunchlist(list.clientSlug, list.slug))
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={list.productId ?? ""}
        disabled={busy}
        onChange={(e) => change(e.target.value || null)}
        aria-label="Product"
        className="rounded-lg border border-line bg-card px-2 py-1 font-ui text-xs text-tk-onyx disabled:opacity-60"
      >
        <option value="">No product</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {error ? <span className="font-ui text-xs text-bad" role="alert">{error}</span> : null}
    </span>
  )
}
