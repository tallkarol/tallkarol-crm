import Link from "next/link"
import { notFound } from "next/navigation"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { StatusSelect } from "../StatusSelect"
import { TaskComposer } from "@/components/tasks/TaskComposer"
import { TaskRows } from "@/components/tasks/TaskRows"
import { db } from "@/db"
import { clientColor } from "@/lib/client-colors"
import { daysSince, readLinks } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import { studiosWithProducts } from "@/lib/products"
import { tasksFor, taskTargets } from "@/lib/tasks"
import { studioCaption } from "@/lib/work"
import { addProductLink, removeProductLink, setProductNotes } from "../actions"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: `Product · ${params.slug}` }
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { peek?: string }
}) {
  const now = new Date()
  const studios = await studiosWithProducts()
  const studio = studios.find((s) =>
    s.products.some((p) => p.slug === params.slug)
  )
  const product = studio?.products.find((p) => p.slug === params.slug)
  if (!studio || !product) notFound()

  const row = await db.query.products.findFirst({
    where: (p, { eq }) => eq(p.id, product.id),
  })
  if (!row) notFound()

  const color = clientColor(product.slug)
  const [productTasks, targets] = await Promise.all([
    tasksFor({ productId: product.id }),
    taskTargets(),
  ])
  const open = productTasks.filter((t) => t.status === "open")
  const overdue = open.filter((t) => (t.overdueDays ?? 0) > 0)
  const links = readLinks(row.links)
  const lastMoved = Math.max(
    product.updatedAt.getTime(),
    ...open.map((task) => new Date(task.updatedAt).getTime())
  )
  const quiet = daysSince(new Date(lastMoved), now)

  return (
    <>
      {searchParams.peek ? (
        <PeekRouter
          peek={searchParams.peek}
          closeHref={ROUTES.productPage(product.slug)}
        />
      ) : null}
      <Link
        href={ROUTES.products}
        className="text-sm font-semibold text-tk-teal hover:underline"
      >
        ← Products
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: color }}
            />
            <h1 className="text-2xl font-semibold tracking-tight text-tk-onyx">
              {product.name}
            </h1>
          </div>
          <p className="mt-1 text-sm text-ink-3">
            {studioCaption(studio)}
            {product.tagline ? ` · ${product.tagline}` : ""}
            {product.clientName ? ` · ${product.clientName}` : ""}
          </p>
        </div>
        <StatusSelect productId={product.id} status={product.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {studios.map((group, index) => (
          <span key={group.id} className="flex flex-wrap items-center gap-2">
            {index > 0 ? (
              <span
                aria-hidden
                className="mx-0.5 hidden h-4 w-px bg-well sm:block"
              />
            ) : null}
            {group.products.map((item) => {
              const on = item.id === product.id
              return (
                <Link
                  key={item.id}
                  href={ROUTES.productPage(item.slug)}
                  aria-current={on ? "page" : undefined}
                  className={
                    on
                      ? "flex items-center gap-2 rounded-xl border border-tk-teal bg-accent px-3 py-1.5 text-sm font-semibold text-tk-linen"
                      : "flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-1.5 text-sm font-semibold text-tk-onyx hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  }
                >
                  <span
                    className="h-2 w-2 rounded-[3px]"
                    style={{
                      background: on ? "#F1EADC" : clientColor(item.slug),
                    }}
                  />
                  {item.name}
                </Link>
              )
            })}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Open tasks"
          value={String(open.length)}
          sub={open.length ? "on this product" : "nothing open"}
        />
        <Stat
          label="Overdue"
          value={String(overdue.length)}
          sub={overdue.length ? overdue.map((t) => t.title).join(" · ") : "none"}
          tone={overdue.length ? "bad" : undefined}
        />
        <Stat
          label="Links"
          value={String(links.length)}
          sub={links.length ? links.map((l) => l.label).join(" · ") : "staging · live · repo"}
        />
        <Stat
          label="Last moved"
          value={quiet === 0 ? "today" : `${quiet}d`}
          sub={quiet > 14 && product.status === "building" ? "gone quiet" : "since a note or a task"}
          tone={quiet > 14 && product.status === "building" ? "bad" : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <section className="rounded-2xl border border-line bg-card shadow-card">
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <h2 className="text-[13px] font-bold text-tk-onyx">Open tasks</h2>
            <span className="text-[11px] tabular-nums text-ink-3">
              {open.length}
            </span>
          </div>

          <div className="px-4 pb-3 pt-2">
            <TaskComposer
              targets={targets}
              scope={{
                clientId: product.clientId,
                clientName: product.clientName,
                clientSlug: product.clientSlug,
                productId: product.id,
                productName: product.name,
              }}
              placeholder={`Add a task for ${product.name}…`}
              compact
            />
          </div>

          {open.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-ink-3">
              Nothing open. Anything typed above lands on {product.name}.
            </p>
          ) : (
            <div className="px-3 pb-3">
              <TaskRows
                tasks={open}
                sortBy="due"
                grouping="none"
                peekBase={ROUTES.productPage(product.slug)}
              />
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-2xl border border-line bg-card shadow-card">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Links</h2>
              <span className="text-[11px] text-ink-3">
                staging · live · repo
              </span>
            </div>
            <ul className="px-1 pb-1">
              {links.length === 0 ? (
                <li className="px-4 py-2 text-sm text-ink-3">
                  Nothing yet — add the staging links below.
                </li>
              ) : (
                links.map((link, i) => (
                  <li
                    key={`${link.url}-${i}`}
                    className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm last:border-0"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate font-semibold text-tk-onyx hover:text-tk-teal"
                    >
                      {link.label}
                    </a>
                    <form action={removeProductLink}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="index" value={i} />
                      <button
                        aria-label={`Remove ${link.label}`}
                        className="px-1 text-xs font-semibold text-ink-3 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </form>
                  </li>
                ))
              )}
            </ul>
            <form
              action={addProductLink}
              className="flex gap-2 border-t border-line px-4 py-3"
            >
              <input type="hidden" name="productId" value={product.id} />
              <input
                name="label"
                placeholder="Label"
                className="w-24 rounded-lg border border-line bg-well px-2.5 py-1.5 text-xs outline-none focus:border-tk-teal"
              />
              <input
                name="url"
                placeholder="https://…"
                className="min-w-0 flex-1 rounded-lg border border-line bg-well px-2.5 py-1.5 text-xs outline-none focus:border-tk-teal"
              />
              <button className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                Add
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
            <h2 className="text-[13px] font-bold text-tk-onyx">Notes</h2>
            <form action={setProductNotes} className="mt-2">
              <input type="hidden" name="productId" value={product.id} />
              <textarea
                name="notes"
                defaultValue={row.notes}
                rows={5}
                className="w-full resize-y rounded-lg border border-line bg-well px-3 py-2 text-sm text-tk-slate outline-none focus:border-tk-teal"
              />
              <button className="mt-2 rounded-full border border-line px-3 py-1 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                Save notes
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: "bad"
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-5 py-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </p>
      <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">
        {value}
      </p>
      <p
        className={`mt-0.5 truncate text-xs ${
          tone === "bad" ? "font-semibold text-red-700" : "text-ink-3"
        }`}
      >
        {sub}
      </p>
    </div>
  )
}
