import type { CsvTable } from "@/lib/insights/csv"

/** Download one snapshot table as CSV — served from the cache, never Google. */
export function CsvLink({ slug, table, label = "CSV" }: { slug: string; table: CsvTable; label?: string }) {
  return (
    <a
      href={`/api/insights/export?site=${encodeURIComponent(slug)}&table=${table}`}
      download
      className="rounded-md border border-line bg-card px-2 py-1 text-[10.5px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
    >
      {label} ↓
    </a>
  )
}
