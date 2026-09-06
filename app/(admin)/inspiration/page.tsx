import Link from "next/link"
import { NewBoardForm } from "@/components/inspiration/NewBoardForm"
import { PageHeader } from "@/components/PageHeader"
import { Card } from "@/components/ui/Card"
import { listBoards } from "@/lib/inspiration-data"
import { providerLabel } from "@/lib/inspiration"
import { ROUTES } from "@/lib/nav"
import { plural } from "@/lib/work"

export const metadata = { title: "Inspiration" }
export const dynamic = "force-dynamic"

export default async function InspirationPage() {
  const boards = await listBoards()

  return (
    <>
      <PageHeader title="Inspiration" />
      <p className="mt-1 text-[11.5px] text-ink-3">
        {boards.length === 0
          ? "Boards you drop links onto from chat or here"
          : plural(boards.length, "board")}
      </p>

      <div className="mt-6">
        <NewBoardForm />
      </div>

      {boards.length === 0 ? (
        <Card
          surface="well"
          elevation="none"
          className="mt-8 max-w-2xl border-dashed p-6 text-sm text-tk-slate"
        >
          <p className="font-semibold text-tk-onyx">Nothing pinned yet</p>
          <p className="mt-1.5 text-ink-3">
            Send a link in chat and say what it is inspiration for — or make a
            board here and pin from the page.
          </p>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={ROUTES.inspirationBoard(board.slug)}
              className="block"
            >
              <Card interactive className="overflow-hidden p-0">
                <div className="relative min-h-[140px] bg-well">
                  {board.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={board.coverUrl}
                      alt=""
                      width={800}
                      height={500}
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-40 flex-col justify-end gap-1 px-5 pb-4">
                      <p className="text-[13px] font-semibold text-tk-slate">
                        {board.coverProvider
                          ? providerLabel(board.coverProvider)
                          : "Empty board"}
                      </p>
                      {board.coverKind === "video" ? (
                        <p className="text-[11.5px] text-ink-3">Video pin</p>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="px-5 py-4">
                  <p className="truncate text-base font-semibold text-tk-onyx">
                    {board.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                    {plural(board.pinCount, "pin")}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
