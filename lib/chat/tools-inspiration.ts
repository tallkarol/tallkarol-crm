import { providerLabel } from "@/lib/inspiration"
import {
  findBoard,
  listBoards,
  listPinsOnBoard,
  pinInspiration,
} from "@/lib/inspiration-data"
import { str, type ToolSpec } from "@/lib/chat/tool-helpers"

export const listInspirationTool: ToolSpec = {
  name: "list_inspiration",
  description:
    "Mood boards and the pins on them. Use for 'what's on the modern websites board', 'show inspiration'. Omit board to list every board.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      board: {
        type: "string",
        description: "Board title or slug, e.g. 'modern websites'.",
      },
    },
  },
  async run(args) {
    const name = str(args, "board")
    if (!name) {
      const boards = await listBoards()
      return {
        boards: boards.map((board) => ({
          title: board.title,
          slug: board.slug,
          pins: board.pinCount,
          href: `/inspiration/${board.slug}`,
        })),
      }
    }
    const detail = await listPinsOnBoard(name)
    if (!detail) return { error: `No board named "${name}".`, pins: [] }
    return {
      board: detail.title,
      slug: detail.slug,
      href: `/inspiration/${detail.slug}`,
      pins: detail.pins.slice(0, 40).map((pin) => ({
        title: pin.title,
        kind: pin.kind,
        provider: pin.provider,
        url: pin.url,
        note: pin.note || null,
      })),
      truncated: detail.pins.length > 40,
    }
  },
}

export const pinInspirationTool: ToolSpec = {
  name: "pin_inspiration",
  description:
    "File a link on an inspiration board. Videos embed, sites get a screenshot. Creates the board if the name is new. Use when Karol says a URL is inspiration for something — 'this is inspiration for modern websites'. Previewed.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The link, image, or video URL." },
      board: {
        type: "string",
        description: "Board name or slug. 'modern websites' is a board.",
      },
      note: { type: "string", description: "Optional note on the pin." },
      title: { type: "string", description: "Optional title override." },
    },
    required: ["url", "board"],
  },
  async preview(args) {
    const url = str(args, "url")
    const boardName = str(args, "board")
    const board = boardName ? await findBoard(boardName) : null
    return {
      title: "Pin inspiration",
      fields: [
        { label: "Board", value: board?.title ?? boardName ?? "—" },
        { label: "URL", value: url ?? "—" },
        { label: "Note", value: str(args, "note") ?? "—" },
      ],
      note: board
        ? `Lands on the existing ${board.title} board.`
        : boardName
          ? `Creates a new board called “${boardName}”.`
          : undefined,
    }
  },
  async run(args, ctx) {
    const url = str(args, "url")
    const board = str(args, "board")
    if (!url) throw new Error("`url` is required.")
    if (!board) throw new Error("`board` is required.")
    const result = await pinInspiration({
      url,
      board,
      note: str(args, "note"),
      title: str(args, "title"),
      userId: ctx.userId,
    })
    return {
      ...result,
      provider: providerLabel(result.provider),
      href: `/inspiration/${result.boardSlug}`,
    }
  },
}

export const INSPIRATION_TOOLS: readonly ToolSpec[] = [
  listInspirationTool,
  pinInspirationTool,
]
