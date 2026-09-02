import Link from "next/link"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { findScaffold, SCAFFOLDS } from "@/content/scaffolds"
import { ROUTES } from "@/lib/nav"

export function generateMetadata({ params }: { params: { slug: string } }) {
  const scaffold = findScaffold(params.slug)
  return { title: scaffold ? `${scaffold.name} · Scaffolds` : "Scaffolds" }
}

export function generateStaticParams() {
  return SCAFFOLDS.map((s) => ({ slug: s.slug }))
}

export default function ScaffoldPage({
  params,
}: {
  params: { slug: string }
}) {
  const scaffold = findScaffold(params.slug)
  if (!scaffold) notFound()

  return (
    <>
      <PageHeader
        title={scaffold.name}
        actions={
          <Link
            href={ROUTES.scaffolds}
            className="rounded-lg border border-tk-slate/20 px-3 py-1.5 text-[13px] font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
          >
            All scaffolds
          </Link>
        }
      />
      <p className="mt-1 text-[11.5px] text-tk-slate/60">
        {scaffold.kind} · distilled from{" "}
        <span className="font-mono">{scaffold.source}</span>
      </p>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-tk-slate">
        {scaffold.summary}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-tk-slate/60">
          Stack
        </h2>
        <div className="mt-2.5 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
          <table className="w-full text-left text-[13px]">
            <tbody>
              {scaffold.stack.map((row) => (
                <tr
                  key={row.layer}
                  className="border-b border-tk-slate/10 last:border-b-0"
                >
                  <td className="w-36 px-4 py-3 align-top font-mono text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
                    {row.layer}
                  </td>
                  <td className="w-72 px-4 py-3 align-top font-semibold text-tk-onyx">
                    {row.choice}
                  </td>
                  <td className="px-4 py-3 align-top leading-relaxed text-tk-slate">
                    {row.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-tk-slate/60">
          Commands
        </h2>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {scaffold.commands.map((row) => (
            <div
              key={row.cmd}
              className="rounded-xl border border-tk-slate/15 bg-white px-4 py-3 shadow-sm"
            >
              <code className="rounded bg-tk-linen px-1.5 py-0.5 font-mono text-xs font-semibold text-tk-onyx">
                {row.cmd}
              </code>
              <p className="mt-1.5 text-[12.5px] text-tk-slate">{row.what}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-tk-slate/60">
          Playbook
        </h2>
        <div className="mt-2.5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {scaffold.playbook.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm"
            >
              <p className="text-[14px] font-semibold text-tk-onyx">
                {section.title}
              </p>
              <ol className="mt-3 flex flex-col gap-2">
                {section.steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex gap-2.5 text-[12.5px] leading-relaxed text-tk-slate"
                  >
                    <span className="shrink-0 font-mono text-[11px] font-bold text-tk-teal">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
