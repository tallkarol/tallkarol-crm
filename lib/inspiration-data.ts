import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { inspirationBoards, inspirationPins } from "@/db/schema"
import {
  slugifyBoard,
  type PinKind,
  type PinProvider,
} from "@/lib/inspiration"
import { unfurl } from "@/lib/inspiration-unfurl"

export type BoardSummary = {
  id: string
  slug: string
  title: string
  description: string
  pinCount: number
  coverUrl: string
  coverKind: PinKind | ""
  coverProvider: string
  updatedAt: Date
}

export type PinView = {
  id: string
  boardId: string
  kind: PinKind
  url: string
  title: string
  note: string
  provider: PinProvider | string
  embedUrl: string
  previewUrl: string
  siteName: string
  description: string
  createdAt: Date
}

export type BoardDetail = {
  id: string
  slug: string
  title: string
  description: string
  pins: PinView[]
}

export async function listBoards(): Promise<BoardSummary[]> {
  const boards = await db.query.inspirationBoards.findMany({
    orderBy: [desc(inspirationBoards.updatedAt)],
    with: {
      pins: {
        orderBy: [desc(inspirationPins.createdAt)],
        columns: {
          kind: true,
          previewUrl: true,
          embedUrl: true,
          provider: true,
        },
      },
    },
  })
  return boards.map((board) => {
    const cover = board.pins[0]
    return {
      id: board.id,
      slug: board.slug,
      title: board.title,
      description: board.description,
      pinCount: board.pins.length,
      coverUrl: cover?.previewUrl || "",
      coverKind: (cover?.kind as PinKind) || "",
      coverProvider: cover?.provider || "",
      updatedAt: board.updatedAt,
    }
  })
}

export async function loadBoard(slug: string): Promise<BoardDetail | null> {
  const board = await db.query.inspirationBoards.findFirst({
    where: eq(inspirationBoards.slug, slug),
    with: {
      pins: { orderBy: [desc(inspirationPins.createdAt)] },
    },
  })
  if (!board) return null
  return {
    id: board.id,
    slug: board.slug,
    title: board.title,
    description: board.description,
    pins: board.pins.map((pin) => ({
      id: pin.id,
      boardId: pin.boardId,
      kind: pin.kind as PinKind,
      url: pin.url,
      title: pin.title,
      note: pin.note,
      provider: pin.provider,
      embedUrl: pin.embedUrl,
      previewUrl: pin.previewUrl,
      siteName: pin.siteName,
      description: pin.description,
      createdAt: pin.createdAt,
    })),
  }
}

export async function findBoard(nameOrSlug: string) {
  const trimmed = nameOrSlug.trim()
  if (!trimmed) return null
  const slug = slugifyBoard(trimmed)
  const bySlug = slug
    ? await db.query.inspirationBoards.findFirst({
        where: eq(inspirationBoards.slug, slug),
      })
    : null
  if (bySlug) return bySlug

  const matches = await db
    .select()
    .from(inspirationBoards)
    .where(sql`lower(${inspirationBoards.title}) = ${trimmed.toLowerCase()}`)
    .limit(1)
  return matches[0] ?? null
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugifyBoard(title) || "board"
  let slug = base
  let n = 2
  for (;;) {
    const existing = await db.query.inspirationBoards.findFirst({
      where: eq(inspirationBoards.slug, slug),
      columns: { id: true },
    })
    if (!existing) return slug
    slug = `${base.slice(0, 70)}-${n}`
    n += 1
  }
}

export async function createBoard(input: {
  title: string
  description?: string
}) {
  const title = input.title.trim()
  if (!title) throw new Error("A board needs a name.")
  const existing = await findBoard(title)
  if (existing) return existing
  const [row] = await db
    .insert(inspirationBoards)
    .values({
      title,
      slug: await uniqueSlug(title),
      description: (input.description ?? "").trim(),
    })
    .returning()
  return row
}

export type PinResult = {
  pinId: string
  boardId: string
  boardSlug: string
  boardTitle: string
  kind: string
  provider: string
  url: string
  title: string
  replayed: boolean
}

/**
 * File a URL on a board, creating the board if the name is new.
 * Same URL on the same board is a no-op (the unique index is the lock).
 */
export async function pinInspiration(input: {
  url: string
  board: string
  note?: string
  title?: string
  userId?: string | null
}): Promise<PinResult> {
  const resolved = await unfurl(input.url)
  if (!resolved) throw new Error("That does not look like a URL.")

  const board =
    (await findBoard(input.board)) ??
    (await createBoard({ title: input.board }))

  const existing = await db.query.inspirationPins.findFirst({
    where: and(
      eq(inspirationPins.boardId, board.id),
      eq(inspirationPins.url, resolved.canonical)
    ),
  })
  if (existing) {
    return {
      pinId: existing.id,
      boardId: board.id,
      boardSlug: board.slug,
      boardTitle: board.title,
      kind: existing.kind,
      provider: existing.provider,
      url: existing.url,
      title: existing.title,
      replayed: true,
    }
  }

  const title = (input.title ?? "").trim() || resolved.title
  const [pin] = await db
    .insert(inspirationPins)
    .values({
      boardId: board.id,
      kind: resolved.kind,
      url: resolved.canonical,
      title,
      note: (input.note ?? "").trim(),
      provider: resolved.provider,
      embedUrl: resolved.embedUrl,
      previewUrl: resolved.previewUrl,
      siteName: resolved.siteName,
      description: resolved.description,
      createdBy: input.userId ?? null,
    })
    .returning({ id: inspirationPins.id })

  await db
    .update(inspirationBoards)
    .set({ updatedAt: new Date() })
    .where(eq(inspirationBoards.id, board.id))

  return {
    pinId: pin.id,
    boardId: board.id,
    boardSlug: board.slug,
    boardTitle: board.title,
    kind: resolved.kind,
    provider: resolved.provider,
    url: resolved.canonical,
    title,
    replayed: false,
  }
}

export async function removePin(id: string) {
  const pin = await db.query.inspirationPins.findFirst({
    where: eq(inspirationPins.id, id),
    columns: { id: true, boardId: true },
  })
  if (!pin) return false
  await db.delete(inspirationPins).where(eq(inspirationPins.id, id))
  await db
    .update(inspirationBoards)
    .set({ updatedAt: new Date() })
    .where(eq(inspirationBoards.id, pin.boardId))
  return true
}

export async function listPinsOnBoard(nameOrSlug: string) {
  const board = await findBoard(nameOrSlug)
  if (!board) return null
  const detail = await loadBoard(board.slug)
  return detail
}

export async function renameBoardNote(
  slug: string,
  description: string
) {
  await db
    .update(inspirationBoards)
    .set({ description: description.trim(), updatedAt: new Date() })
    .where(eq(inspirationBoards.slug, slug))
}
