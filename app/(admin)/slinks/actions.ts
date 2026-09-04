"use server"

import { revalidatePath } from"next/cache"
import { redirect } from"next/navigation"
import { eq } from"drizzle-orm"
import { db } from"@/db"
import { slinkRecipients, slinks, vaultEntries } from"@/db/schema"
import { getSessionUser } from"@/lib/auth"
import { ROUTES } from"@/lib/nav"
import {
 SLINK_RULES,
 grantExpiry,
 isBlockKind,
 isEmail,
 normalizeEmail,
 parseFields,
 parseTable,
} from"@/lib/slink"
import {
 addBlock,
 addFile,
 createSlink,
 decideRequest,
 deleteBlock,
 logEvent,
 moveBlock,
 revokeRecipient,
 setGrant,
 upsertRecipient,
} from"@/lib/slink-data"
import { sendMagicLink } from"@/lib/slink-auth"

/**
 * Everything Karol does to a slink. Each action re-checks the admin session —
 * a server action is a public endpoint that happens to be typed.
 */

function touch(id?: string) {
 revalidatePath(ROUTES.slinks)
 if (id) revalidatePath(`${ROUTES.slinks}/${id}`)
}

function str(form: FormData, key: string, max = 400) {
 return String(form.get(key) ??"").trim().slice(0, max)
}

/**"24" → 24 h from now;"never" → null, the indefinite toggle. */
function readGrantHours(form: FormData): number | null {
 const raw = str(form,"grant", 20) || String(SLINK_RULES.defaultGrantHours)
 if (raw ==="never") return null
 const n = Number(raw)
 return Number.isFinite(n) && n > 0 ? n : SLINK_RULES.defaultGrantHours
}

export async function createSlinkAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return

 const title = str(formData,"title", SLINK_RULES.maxTitle)
 if (!title) return
 const row = await createSlink({
 title,
 intro: str(formData,"intro", SLINK_RULES.maxIntro),
 clientId: str(formData,"clientId", 80) || null,
 userId: user.id,
 })
 touch()
 redirect(`${ROUTES.slinks}/${row.id}`)
}

export async function updateSlinkAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const id = str(formData,"slinkId", 80)
 if (!id) return
 await db
 .update(slinks)
 .set({
 title: str(formData,"title", SLINK_RULES.maxTitle),
 intro: str(formData,"intro", SLINK_RULES.maxIntro),
 clientId: str(formData,"clientId", 80) || null,
 updatedAt: new Date(),
 })
 .where(eq(slinks.id, id))
 touch(id)
}

export async function archiveSlinkAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const id = str(formData,"slinkId", 80)
 if (!id) return
 const archived = str(formData,"archived", 10) ==="1"
 await db
 .update(slinks)
 .set({
 status: archived ?"archived" :"active",
 archivedAt: archived ? new Date() : null,
 updatedAt: new Date(),
 })
 .where(eq(slinks.id, id))
 if (archived) await logEvent({ slinkId: id, kind:"archived" })
 touch(id)
}

/* ----------------------------------------------------------------- people */

/**
 * Invite, or re-share with someone whose grant lapsed. Both are the same
 * operation: set the grant, then send a link. Re-sharing keeps the person's
 * history rather than starting a second trail for the same address.
 */
export async function inviteAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const slinkId = str(formData,"slinkId", 80)
 const email = normalizeEmail(str(formData,"email", 320))
 if (!slinkId || !isEmail(email)) return

 const slink = await db.query.slinks.findFirst({ where: eq(slinks.id, slinkId) })
 if (!slink) return

 const expiresAt = grantExpiry(readGrantHours(formData), new Date())
 const recipient = await upsertRecipient({
 slinkId,
 email,
 name: str(formData,"name", 160),
 expiresAt,
 invitedBy: user.id,
 })

 await logEvent({ slinkId, recipientId: recipient.id, kind:"invited", detail: email })
 await sendMagicLink({
 slinkId,
 publicId: slink.publicId,
 recipientId: recipient.id,
 email,
 title: slink.title,
 expiresAt,
 }).catch(() => null)

 touch(slinkId)
}

/** The per-person toggle: a window, or never. */
export async function setGrantAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const recipientId = str(formData,"recipientId", 80)
 if (!recipientId) return
 const row = await setGrant(recipientId, grantExpiry(readGrantHours(formData), new Date()))
 if (row) touch(row.slinkId)
}

export async function revokeAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const recipientId = str(formData,"recipientId", 80)
 if (!recipientId) return
 const row = await revokeRecipient(recipientId)
 if (row) touch(row.slinkId)
}

export async function resendAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const recipientId = str(formData,"recipientId", 80)
 if (!recipientId) return

 const recipient = await db.query.slinkRecipients.findFirst({
 where: eq(slinkRecipients.id, recipientId),
 })
 if (!recipient) return
 const slink = await db.query.slinks.findFirst({ where: eq(slinks.id, recipient.slinkId) })
 if (!slink) return

 await sendMagicLink({
 slinkId: slink.id,
 publicId: slink.publicId,
 recipientId: recipient.id,
 email: recipient.email,
 title: slink.title,
 expiresAt: recipient.expiresAt,
 }).catch(() => null)
 touch(slink.id)
}

/* --------------------------------------------------------------- requests */

/**
 * Approving a request is the only way a new address gets in — there is no
 * self-approval, same domain or not.
 */
export async function decideRequestAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const requestId = str(formData,"requestId", 80)
 const decision = str(formData,"decision", 12)
 if (!requestId || (decision !=="granted" && decision !=="denied")) return

 const row = await decideRequest(requestId, decision, user.id)
 if (!row) return

 if (decision ==="denied") {
 await logEvent({ slinkId: row.slinkId, kind:"access_denied", detail: row.email })
 touch(row.slinkId)
 return
 }

 const slink = await db.query.slinks.findFirst({ where: eq(slinks.id, row.slinkId) })
 if (!slink) return
 const expiresAt = grantExpiry(readGrantHours(formData), new Date())
 const recipient = await upsertRecipient({
 slinkId: row.slinkId,
 email: row.email,
 name: row.name,
 expiresAt,
 invitedBy: user.id,
 })
 await logEvent({
 slinkId: row.slinkId,
 recipientId: recipient.id,
 kind:"access_granted",
 detail: row.email,
 })
 await sendMagicLink({
 slinkId: slink.id,
 publicId: slink.publicId,
 recipientId: recipient.id,
 email: row.email,
 title: slink.title,
 expiresAt,
 }).catch(() => null)
 touch(row.slinkId)
}

/* ----------------------------------------------------------------- blocks */

export async function addBlockAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const slinkId = str(formData,"slinkId", 80)
 const kind = str(formData,"kind", 24)
 if (!slinkId || !isBlockKind(kind)) return

 const title = str(formData,"title", 200)
 const note = str(formData,"note", 2000)

 if (kind ==="text") {
 await addBlock({ slinkId, kind, title, note, data: { body: str(formData,"body", 8000) } })
 } else if (kind ==="table") {
 await addBlock({ slinkId, kind, title, note, data: parseTable(str(formData,"tsv", 20000)) })
 } else if (kind ==="fields") {
 await addBlock({ slinkId, kind, title, note, data: parseFields(str(formData,"pairs", 8000)) })
 } else if (kind ==="link") {
 await addBlock({
 slinkId,
 kind,
 title,
 note,
 data: { url: str(formData,"url", 800), label: str(formData,"label", 200) },
 })
 } else if (kind ==="credential") {
 // Picked from the Vault; the secret stays in the vault row.
 const entryId = str(formData,"vaultEntryId", 80)
 if (!entryId) return
 const entry = await db.query.vaultEntries.findFirst({ where: eq(vaultEntries.id, entryId) })
 if (!entry) return
 await addBlock({
 slinkId,
 kind,
 title: title || entry.title,
 note,
 sourceKind:"vault",
 sourceId: entryId,
 })
 } else if (kind ==="punchlist" || kind ==="reports" || kind ==="dashboard") {
 const sourceId = str(formData,"sourceId", 80)
 if (kind !=="dashboard" && !sourceId) return
 await addBlock({
 slinkId,
 kind,
 title,
 note,
 sourceKind: kind ==="punchlist" ?"punchlist" : kind ==="reports" ?"client" :"client",
 sourceId: sourceId || null,
 })
 } else if (kind ==="file") {
 const file = formData.get("file")
 if (!(file instanceof File) || file.size === 0) return
 const block = await addBlock({ slinkId, kind, title: title || file.name, note })
 const bytes = Buffer.from(await file.arrayBuffer())
 await addFile({
 slinkId,
 blockId: block.id,
 name: file.name,
 mime: file.type ||"application/octet-stream",
 data: bytes,
 })
 }
 touch(slinkId)
}

export async function deleteBlockAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const blockId = str(formData,"blockId", 80)
 const slinkId = str(formData,"slinkId", 80)
 if (!blockId) return
 await deleteBlock(blockId)
 touch(slinkId)
}

export async function moveBlockAction(formData: FormData) {
 const user = await getSessionUser()
 if (!user) return
 const blockId = str(formData,"blockId", 80)
 const slinkId = str(formData,"slinkId", 80)
 const dir = str(formData,"dir", 4) ==="up" ? -1 : 1
 if (!blockId) return
 await moveBlock(blockId, dir)
 touch(slinkId)
}

export async function listVaultChoices() {
 return db.query.vaultEntries.findMany({
 columns: { id: true, title: true, username: true },
 orderBy: (t, { asc }) => [asc(t.title)],
 limit: 200,
 })
}
