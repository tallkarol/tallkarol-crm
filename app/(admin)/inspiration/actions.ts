"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import {
  createBoard,
  pinInspiration,
  removePin,
} from "@/lib/inspiration-data"
import { ROUTES } from "@/lib/nav"

function touch(slug?: string) {
  revalidatePath(ROUTES.inspiration)
  if (slug) revalidatePath(ROUTES.inspirationBoard(slug))
}

function read(formData: FormData, key: string, max = 2000) {
  return String(formData.get(key) || "").trim().slice(0, max)
}

export async function addBoard(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const title = read(formData, "title", 120)
  if (!title) return
  const board = await createBoard({
    title,
    description: read(formData, "description", 400),
  })
  touch(board.slug)
  redirect(ROUTES.inspirationBoard(board.slug))
}

export async function addPin(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const board = read(formData, "board", 120)
  const url = read(formData, "url", 2000)
  if (!board || !url) return
  const result = await pinInspiration({
    url,
    board,
    note: read(formData, "note", 800),
    title: read(formData, "title", 200),
    userId: user.id,
  })
  touch(result.boardSlug)
}

export async function deletePin(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const id = read(formData, "id", 80)
  const slug = read(formData, "slug", 80)
  if (!id) return
  await removePin(id)
  touch(slug)
}
