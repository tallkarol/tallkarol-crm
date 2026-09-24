"use client"

import { useEffect } from "react"
import { usePanelSlot } from "@/components/nav/PanelSlot"
import { ProductPanel } from "@/components/products/ProductPanel"
import type { ProductPanelData, ProductShell } from "@/lib/product-rooms"

/** Puts the product's panel into the dock while this layout is mounted — as ClientPanelMount does. */
export function ProductPanelMount({ product, data }: { product: ProductShell; data: ProductPanelData }) {
  const { setOverride } = usePanelSlot()
  useEffect(() => {
    setOverride(<ProductPanel product={product} data={data} />)
    return () => setOverride(null)
  }, [product, data, setOverride])
  return null
}
