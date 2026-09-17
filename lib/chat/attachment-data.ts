import { NextResponse } from "next/server"
import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm"
import { db } from "@/db"
import { chatAttachments, chatMessages } from "@/db/schema"
import { ATTACH, attachmentName, refuseImage, type AttachmentView } from "@/lib/chat/attachments"

/**
 * The database half of pasted screenshots. The rules live in
 * lib/chat/attachments.ts (pure); this file only reads and writes rows.
 */

export async function saveAttachment(
  userId: string,
  bytes: Uint8Array,
  rawName: string
): Promise<{ ok: true; attachment: AttachmentView } | { ok: false; error: string }> {
  const { info, error } = refuseImage(bytes)
  if (!info) return { ok: false, error }

  // Pasted and never sent: gone after a day. Swept here rather than on a
  // timer because this is the only place orphans are made.
  await db
    .delete(chatAttachments)
    .where(
      and(
        eq(chatAttachments.userId, userId),
        isNull(chatAttachments.messageId),
        lt(chatAttachments.createdAt, new Date(Date.now() - ATTACH.orphanMs))
      )
    )

  const [row] = await db
    .insert(chatAttachments)
    .values({
      userId,
      name: attachmentName(rawName, info.mime),
      mime: info.mime,
      bytes: bytes.length,
      width: info.width,
      height: info.height,
      data: Buffer.from(bytes),
    })
    .returning({
      id: chatAttachments.id,
      name: chatAttachments.name,
      width: chatAttachments.width,
      height: chatAttachments.height,
    })
  return { ok: true, attachment: row }
}

/**
 * Checked BEFORE the message is written, so a send with a stale id fails
 * whole instead of leaving a message that says less than Karol sent.
 */
export async function assertUnsent(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const rows = await db
    .select({ id: chatAttachments.id })
    .from(chatAttachments)
    .where(
      and(
        inArray(chatAttachments.id, ids),
        eq(chatAttachments.userId, userId),
        isNull(chatAttachments.messageId)
      )
    )
  if (rows.length !== ids.length) {
    throw new Error("A screenshot is missing or was already sent. Remove it and paste it again.")
  }
}

export async function attachToMessage(userId: string, ids: string[], messageId: string): Promise<void> {
  if (ids.length === 0) return
  await db
    .update(chatAttachments)
    .set({ messageId })
    .where(
      and(
        inArray(chatAttachments.id, ids),
        eq(chatAttachments.userId, userId),
        isNull(chatAttachments.messageId)
      )
    )
}

/** Every sent image in a thread, in the order it was pasted. */
export async function threadAttachments(threadId: string) {
  return db
    .select({
      id: chatAttachments.id,
      messageId: chatAttachments.messageId,
      name: chatAttachments.name,
      mime: chatAttachments.mime,
      width: chatAttachments.width,
      height: chatAttachments.height,
    })
    .from(chatAttachments)
    .innerJoin(chatMessages, eq(chatAttachments.messageId, chatMessages.id))
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatAttachments.createdAt))
}

/** One image with its bytes, for the two routes that serve it. */
export async function attachmentFile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const row = await db.query.chatAttachments.findFirst({
    where: eq(chatAttachments.id, id),
  })
  return row ?? null
}

/**
 * The bytes as a response. The type is the one sniffed at upload, and
 * `nosniff` keeps the browser from second-guessing it; the id never points
 * at different bytes, so a private cache can keep it for a day. A header
 * cannot carry "Zrzut ekranu – ł.png" as is, so the plain `filename` gets an
 * ASCII copy and `filename*` the real one.
 */
export function imageResponse(row: NonNullable<Awaited<ReturnType<typeof attachmentFile>>>) {
  if (!row.data) return new NextResponse("Not found", { status: 404 })
  const ascii = row.name.replace(/[^\x20-\x7e]/g, "_")
  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.data.length),
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
