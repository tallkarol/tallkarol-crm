"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { vaultEntries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { decryptVaultSecret, encryptVaultSecret } from "@/lib/vault-data"
import { isVaultKind } from "@/lib/vault"

function touch() {
  revalidatePath(ROUTES.vault)
}

function readString(formData: FormData, key: string, max = 400) {
  return String(formData.get(key) || "").trim().slice(0, max)
}

function readKind(formData: FormData) {
  const kind = readString(formData, "kind", 20)
  return isVaultKind(kind) ? kind : "login"
}

function readUrl(formData: FormData) {
  let url = readString(formData, "url", 500)
  if (url && !/^https?:\/\//i.test(url) && !/^[\w.-]+:/.test(url)) {
    url = `https://${url}`
  }
  return url
}

export async function addVaultEntry(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return

  const title = readString(formData, "title", 160)
  if (!title) return

  const clientId = readString(formData, "clientId", 80)
  await db.insert(vaultEntries).values({
    title,
    kind: readKind(formData),
    url: readUrl(formData),
    username: readString(formData, "username", 240),
    secretBlob: encryptVaultSecret(readString(formData, "secret", 8000)),
    notes: readString(formData, "notes", 2000),
    clientId: clientId || null,
    createdBy: user.id,
  })
  touch()
}

export async function updateVaultEntry(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return

  const id = readString(formData, "id", 80)
  const title = readString(formData, "title", 160)
  if (!id || !title) return

  const existing = await db.query.vaultEntries.findFirst({
    where: eq(vaultEntries.id, id),
    columns: { id: true, secretBlob: true },
  })
  if (!existing) return

  const nextSecret = readString(formData, "secret", 8000)
  const clientId = readString(formData, "clientId", 80)
  await db
    .update(vaultEntries)
    .set({
      title,
      kind: readKind(formData),
      url: readUrl(formData),
      username: readString(formData, "username", 240),
      secretBlob: nextSecret
        ? encryptVaultSecret(nextSecret)
        : existing.secretBlob,
      notes: readString(formData, "notes", 2000),
      clientId: clientId || null,
      updatedAt: new Date(),
    })
    .where(eq(vaultEntries.id, id))
  touch()
}

export async function deleteVaultEntry(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const id = readString(formData, "id", 80)
  if (!id) return
  await db.delete(vaultEntries).where(eq(vaultEntries.id, id))
  touch()
}

export async function revealVaultSecret(id: string) {
  const user = await getSessionUser()
  if (!user || !id) return { ok: false as const, secret: "" }

  const row = await db.query.vaultEntries.findFirst({
    where: eq(vaultEntries.id, id),
    columns: { secretBlob: true },
  })
  if (!row) return { ok: false as const, secret: "" }

  try {
    return { ok: true as const, secret: decryptVaultSecret(row.secretBlob) }
  } catch {
    return { ok: false as const, secret: "" }
  }
}
