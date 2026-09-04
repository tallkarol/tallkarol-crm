import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { clientColor, markColor } from "@/lib/client-colors"
import { daysSince } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import {
  flattenProducts,
  nextProductTask,
  studiosWithProducts,
} from "@/lib/products"
import { allTasks } from "@/lib/tasks"
import type { HubTask } from "@/lib/task-view"
import { Card } from "@/components/ui/Card"
import {
  PRODUCT_STATUS_LABEL,
  PRODUCT_STUDIO_KIND_LABEL,
  plural,
  productStatusClass,
} from "@/lib/work"

export const metadata = { title: "Products" }
export const dynamic = "force-dynamic"

const STALE_DAYS = 14

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { peek?: string }
}) {
  const now = new Date()
  const [studios, tasks] = await Promise.all([
    studiosWithProducts(),
    allTasks(now),
  ])
  const catalog = flattenProducts(studios)

  const openByProduct = new Map<string, HubTask[]>()
  for (const task of tasks) {
    if (task.status !== "open" || !task.productId) continue
    const list = openByProduct.get(task.productId) ?? []
    list.push(task)
    openByProduct.set(task.productId, list)
  }

  const building = catalog.filter((product) => product.status === "building")
  const live = catalog.filter((product) => product.status === "live")
  const openTasks = catalog.flatMap((product) => openByProduct.get(product.id) ?? [])
  const overdue = openTasks.filter((task) => (task.overdueDays ?? 0) > 0)
  const stale = catalog.filter((product) => {
    if (product.status === "live" || product.status === "paused") return false
    const open = openByProduct.get(product.id) ?? []
    const last = Math.max(
      product.updatedAt.getTime(),
      ...open.map((task) => new Date(task.updatedAt).getTime())
    )
    return daysSince(new Date(last), now) > STALE_DAYS
  })
  const needsYou = overdue.length + stale.length

  return (
    <>
      <PageHeader title="Products" />
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.products} />
      ) : null}

      <p className="mt-1 text-[11.5px] text-ink-3">
        {plural(catalog.length, "product")}
        {" · "}
        {openTasks.length === 0
          ? "nothing open"
          : plural(openTasks.length, "open task")}
        {" · "}
        {now.toLocaleDateString("en-US", { day: "numeric", month: "long" })}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Building"
          value={String(building.length)}
          sub={building.map((product) => product.name).join(" · ") || "none in flight"}
        />
        <Kpi
          label="Open tasks"
          value={String(openTasks.length)}
          sub={
            overdue.length
              ? `${overdue.length} overdue`
              : openTasks.length
                ? "nothing overdue"
                : "quiet"
          }
          tone={overdue.length ? "bad" : undefined}
        />
        <Kpi
          label="Live"
          value={String(live.length)}
          sub={live.map((product) => product.name).join(" · ") || "none shipped yet"}
          tone={live.length ? "good" : undefined}
        />
        <Kpi
          label="Needs you"
          value={String(needsYou)}
          sub={
            needsYou === 0
              ? "nothing waiting"
              : [
                  overdue.length
                    ? plural(overdue.length, "overdue task")
                    : null,
                  stale.length ? `${stale.length} gone quiet` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
          }
          tone={needsYou ? "bad" : undefined}
        />
      </div>

      <div className="mt-8 flex flex-col gap-10">
        {studios.map((studio) => (
          <section key={studio.id}>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-['Inter_Tight',sans-serif] text-lg font-bold tracking-tight text-tk-onyx">
                    {studio.name}
                  </h2>
                  {studio.kind !== "solo" ? (
                    <span className="rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold text-ink-3">
                      {PRODUCT_STUDIO_KIND_LABEL[studio.kind]}
                    </span>
                  ) : null}
                </div>
                {studio.notes ? (
                  <p className="mt-1 max-w-2xl text-sm text-ink-3">
                    {studio.notes}
                  </p>
                ) : null}
              </div>
              <p className="text-[11px] tabular-nums text-ink-3">
                {plural(studio.products.length, "product")}
              </p>
            </div>

            {studio.products.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line bg-well px-5 py-6 text-sm text-ink-3">
                Nothing here yet.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {studio.products.map((product) => {
                  const color = clientColor(product.slug)
                  const open = openByProduct.get(product.id) ?? []
                  const next = nextProductTask(open)
                  const lastMoved = Math.max(
                    product.updatedAt.getTime(),
                    ...open.map((task) => new Date(task.updatedAt).getTime())
                  )
                  const quiet = daysSince(new Date(lastMoved), now)
                  const blurb = product.notes || product.tagline

                  return (
                    <Card className="flex flex-col gap-3 p-5 pb-4" key={product.id} style={{ borderLeftWidth: 3, borderLeftColor: markColor(color) }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: markColor(color) }}
                        />
                        <Link
                          href={ROUTES.productPage(product.slug)}
                          className="font-['Inter_Tight',sans-serif] text-base font-bold text-tk-onyx hover:text-tk-teal"
                        >
                          {product.name}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${productStatusClass(product.status)}`}
                        >
                          {PRODUCT_STATUS_LABEL[product.status]}
                        </span>
                        {quiet > STALE_DAYS &&
                        product.status !== "live" &&
                        product.status !== "paused" ? (
                          <span className="rounded-full bg-red-700/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-red-700">
                            no movement · {quiet}d
                          </span>
                        ) : null}
                        {product.linkCount > 0 ? (
                          <span className="ml-auto text-[11px] tabular-nums text-ink-3">
                            {plural(product.linkCount, "link")}
                          </span>
                        ) : null}
                      </div>

                      {blurb ? (
                        <p className="line-clamp-2 text-sm text-ink-3">
                          {blurb}
                        </p>
                      ) : null}

                      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3 text-[12.5px] text-tk-slate">
                        <span className="text-[10.5px] font-bold uppercase tracking-widest text-ink-3">
                          Next
                        </span>
                        {next ? (
                          <Link
                            href={`${ROUTES.products}?peek=task:${next.id}`}
                            scroll={false}
                            className="min-w-0 truncate hover:text-tk-teal hover:underline"
                          >
                            {next.title}
                          </Link>
                        ) : (
                          <span className="text-ink-3">no open tasks</span>
                        )}
                        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-3">
                          {open.length === 0
                            ? "quiet"
                            : plural(open.length, "open task")}
                          {next?.overdueDays
                            ? ` · overdue ${next.overdueDays}d`
                            : ""}
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: "good" | "bad"
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </p>
      <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">
        {value}
      </p>
      <p
        className={`mt-0.5 truncate text-xs ${
          tone === "bad"
            ? "font-semibold text-red-700"
            : tone === "good"
              ? "font-semibold text-emerald-800"
              : "text-ink-3"
        }`}
      >
        {sub}
      </p>
    </Card>
  )
}
