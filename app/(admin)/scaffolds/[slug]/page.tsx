import Link from "next/link"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { findScaffold, SCAFFOLDS } from "@/content/scaffolds"
import { ROUTES } from "@/lib/nav"
import { Card } from "@/components/ui/Card"

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
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
          >
            All scaffolds
          </Link>
        }
      />
      <p className="mt-1 text-[11.5px] text-ink-3">
        {scaffold.kind} · distilled from{" "}
        <span className="font-mono">{scaffold.source}</span>
      </p>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-tk-slate">
        {scaffold.summary}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">
          Stack
        </h2>
        <Card className="mt-2.5 overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <tbody>
              {scaffold.stack.map((row) => (
                <tr
                  key={row.layer}
                  className="border-b border-line last:border-b-0"
                >
                  <td className="w-36 px-4 py-3 align-top font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-3">
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
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">
          Commands
        </h2>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {scaffold.commands.map((row) => (
            <Card radius="xl" className="px-4 py-3" key={row.cmd}>
              <code className="rounded bg-well px-1.5 py-0.5 font-mono text-xs font-semibold text-tk-onyx">
                {row.cmd}
              </code>
              <p className="mt-1.5 text-[12.5px] text-tk-slate">{row.what}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">
          Playbook
        </h2>
        <div className="mt-2.5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {scaffold.playbook.map((section) => (
            <Card className="p-5" key={section.title}>
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
            </Card>
          ))}
        </div>
      </section>
    </>
  )
}
