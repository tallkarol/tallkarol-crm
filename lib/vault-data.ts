import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import { desc } from "drizzle-orm"
import { db } from "@/db"
import { vaultEntries } from "@/db/schema"
import { asVaultKind, type VaultEntryView } from "@/lib/vault"

function vaultKey() {
  const raw = process.env.VAULT_SECRET || process.env.SESSION_SECRET
  if (!raw) {
    throw new Error("VAULT_SECRET or SESSION_SECRET is required to use the vault")
  }
  return createHash("sha256").update(raw).digest()
}

export function encryptVaultSecret(plain: string) {
  const trimmed = plain.trim()
  if (!trimmed) return ""
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv)
  const enc = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}.${tag.toString("hex")}.${enc.toString("hex")}`
}

export function decryptVaultSecret(blob: string) {
  if (!blob) return ""
  const [ivHex, tagHex, dataHex] = blob.split(".")
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Vault secret is not in a readable format")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    vaultKey(),
    Buffer.from(ivHex, "hex")
  )
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8")
}

export async function listVaultEntries(): Promise<VaultEntryView[]> {
  const rows = await db.query.vaultEntries.findMany({
    orderBy: [desc(vaultEntries.updatedAt)],
    with: { client: { columns: { id: true, name: true, slug: true } } },
  })
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: asVaultKind(row.kind),
    url: row.url,
    username: row.username,
    notes: row.notes,
    hasSecret: Boolean(row.secretBlob),
    client: row.client,
    updatedAt: row.updatedAt,
  }))
}
