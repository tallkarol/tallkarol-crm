"use client"

import type { ProductStatus } from "@/db/schema"
import { PRODUCT_STATUS_LABEL, productStatusClass } from "@/lib/work"
import { setProductStatus } from "./actions"

const STATUSES: ProductStatus[] = ["idea", "building", "live", "paused"]

export function StatusSelect({
  productId,
  status,
}: {
  productId: string
  status: ProductStatus
}) {
  return (
    <form action={setProductStatus}>
      <input type="hidden" name="productId" value={productId} />
      <label className="sr-only" htmlFor="product-status">
        Status
      </label>
      <select
        id="product-status"
        name="status"
        defaultValue={status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold focus:ring-2 focus:ring-tk-teal/40 ${productStatusClass(status)}`}
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {PRODUCT_STATUS_LABEL[value]}
          </option>
        ))}
      </select>
    </form>
  )
}
