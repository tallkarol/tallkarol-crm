"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { products, type ProductStatus } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { readLinks } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"

const STATUSES: ProductStatus[] = ["idea", "building", "live", "paused"]

function touch(slug: string) {
  revalidatePath(ROUTES.products)
  revalidatePath(ROUTES.productPage(slug))
}

export async function setProductStatus(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const id = String(formData.get("productId") || "")
  const status = String(formData.get("status") || "") as ProductStatus
  if (!id || !STATUSES.includes(status)) return

  const product = await db.query.products.findFirst({
    where: (p, { eq: e }) => e(p.id, id),
  })
  if (!product) return
  await db
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(eq(products.id, id))
  touch(product.slug)
}

export async function setProductNotes(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const id = String(formData.get("productId") || "")
  const notes = String(formData.get("notes") || "").slice(0, 4000)
  if (!id) return

  const product = await db.query.products.findFirst({
    where: (p, { eq: e }) => e(p.id, id),
  })
  if (!product) return
  await db
    .update(products)
    .set({ notes, updatedAt: new Date() })
    .where(eq(products.id, id))
  touch(product.slug)
}

export async function addProductLink(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const productId = String(formData.get("productId") || "")
  const label = String(formData.get("label") || "").trim()
  let url = String(formData.get("url") || "").trim()
  if (!productId || !label || !url) return
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  const product = await db.query.products.findFirst({
    where: (p, { eq: e }) => e(p.id, productId),
  })
  if (!product) return
  const links = [...readLinks(product.links), { label, url }]
  await db
    .update(products)
    .set({ links, updatedAt: new Date() })
    .where(eq(products.id, productId))
  touch(product.slug)
}

export async function removeProductLink(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const productId = String(formData.get("productId") || "")
  const index = Number(formData.get("index"))
  const product = await db.query.products.findFirst({
    where: (p, { eq: e }) => e(p.id, productId),
  })
  if (!product || !Number.isInteger(index)) return
  const links = readLinks(product.links).filter((_, i) => i !== index)
  await db
    .update(products)
    .set({ links, updatedAt: new Date() })
    .where(eq(products.id, productId))
  touch(product.slug)
}
