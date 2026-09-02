import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { SCAFFOLDS } from "@/content/scaffolds"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Scaffolds" }

export default function ScaffoldsPage() {
  return (
    <>
      <PageHeader title="Scaffolds" />
      <p className="mt-1 text-[11.5px] text-tk-slate/60">
        Build notes per project type — preferred stacks and the moves that
        repeat. Distilled from real projects; edit content/scaffolds.ts to grow
        it.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SCAFFOLDS.map((scaffold) => (
          <Link
            key={scaffold.slug}
            href={ROUTES.scaffold(scaffold.slug)}
            className="group flex flex-col rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm hover:border-tk-teal/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-tk-onyx group-hover:text-tk-teal">
                  {scaffold.name}
                </p>
                <p className="mt-0.5 text-[12.5px] text-tk-slate/70">
                  {scaffold.kind}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-tk-teal/10 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-tk-teal">
                {scaffold.stack.length} layers
              </span>
            </div>

            <p className="mt-3 line-clamp-3 text-[12.5px] leading-relaxed text-tk-slate">
              {scaffold.summary}
            </p>

            <div className="mt-auto flex items-center justify-between border-t border-tk-slate/10 pt-3.5">
              <span className="font-mono text-[10.5px] text-tk-slate/50">
                from {scaffold.source}
              </span>
              <span className="text-[12px] font-semibold text-tk-teal">
                Open →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
