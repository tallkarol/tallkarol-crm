import Link from"next/link"
import { CopyButton } from"@/components/slink/CopyButton"
import { RevealButton } from"@/components/slink/RevealButton"
import {
 BLOCK_LABEL,
 readFields,
 readLink,
 readTable,
 safeHref,
 toCsv,
 type BlockKind,
} from"@/lib/slink"
import type { CredentialView, PunchlistView, ReportView } from"@/lib/slink-live"

/**
 * How a slink renders to the person it was shared with.
 *
 * Two rules run through all of it. Values a recipient has to retype — a DNS
 * value, a routing number — get a copy button, because retyping is where these
 * hand-offs actually go wrong. And a credential is watermarked with the
 * viewer's own address, so a screenshot that travels carries the name of
 * whoever took it.
 */

export function BlockShell({
 title,
 kind,
 note,
 action,
 children,
}: {
 title: string
 kind: BlockKind
 note?: string
 action?: React.ReactNode
 children: React.ReactNode
}) {
 return (
 <section className="overflow-hidden rounded-xl border border-line bg-tk-white">
 <header className="flex items-center gap-3 border-b border-line px-4 py-3">
 <h2 className="font-['Inter_Tight',sans-serif] text-[15px] font-semibold text-tk-onyx">
 {title || BLOCK_LABEL[kind]}
 </h2>
 <span className="flex-1" />
 {action}
 </header>
 {note ? (
 <p className="border-b border-line px-4 py-2.5 text-[13px] text-ink-3">
 {note}
 </p>
 ) : null}
 <div className="p-4">{children}</div>
 </section>
 )
}

export function TextBlock({ data }: { data: unknown }) {
 const body = typeof (data as { body?: unknown })?.body ==="string"
 ? ((data as { body: string }).body)
 :""
 return (
 <div className="max-w-[68ch] space-y-3 text-[13.5px] leading-relaxed text-tk-slate">
 {body.split(/\n{2,}/).map((para, i) => (
 <p key={i}>{para}</p>
 ))}
 </div>
 )
}

export function TableBlock({ data }: { data: unknown }) {
 const table = readTable(data)
 if (!table.columns.length && !table.rows.length) {
 return <p className="text-[13px] text-ink-3">Nothing here yet.</p>
 }
 return (
 <div className="-mx-4 -mb-4 overflow-x-auto">
 <table className="w-full border-collapse text-[13px]">
 <thead>
 <tr>
 {table.columns.map((c) => (
 <th
 key={c}
 className="whitespace-nowrap border-b border-line px-4 py-2 text-left font-['Inter_Tight',sans-serif] text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3"
 >
 {c}
 </th>
 ))}
 <th className="border-b border-line px-4 py-2" />
 </tr>
 </thead>
 <tbody>
 {table.rows.map((row, i) => (
 <tr key={i}>
 {row.map((cell, j) => (
 <td
 key={j}
 className="border-b border-line px-4 py-2 align-top font-mono text-[12.5px] tabular-nums text-tk-onyx"
 >
 <span className="break-all">{cell}</span>
 </td>
 ))}
 <td className="border-b border-line px-4 py-2 text-right">
 <CopyButton value={row.join("\t")} label="Copy row" />
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )
}

export function TableCsvAction({ data }: { data: unknown }) {
 const table = readTable(data)
 if (!table.rows.length) return null
 return <CopyButton value={toCsv(table)} label="Copy as CSV" />
}

export function FieldsBlock({ data }: { data: unknown }) {
 const { fields } = readFields(data)
 if (!fields.length) return <p className="text-[13px] text-ink-3">Nothing here yet.</p>
 return (
 <dl className="grid gap-2">
 {fields.map((f, i) => (
 <div
 key={i}
 className="grid grid-cols-[minmax(96px,140px)_1fr_auto] items-center gap-3 rounded-lg border border-line bg-well px-3 py-2"
 >
 <dt className="font-['Inter_Tight',sans-serif] text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
 {f.label}
 </dt>
 <dd className="break-all font-mono text-[12.5px] text-tk-onyx">{f.value}</dd>
 <CopyButton value={f.value} label="Copy" />
 </div>
 ))}
 </dl>
 )
}

export function LinkBlock({ data }: { data: unknown }) {
 const link = readLink(data)
 const href = safeHref(link.url)
 if (!href) return <p className="text-[13px] text-ink-3">No link set.</p>
 return (
 <a
 href={href}
 rel="noreferrer noopener"
 target="_blank"
 className="inline-flex items-center gap-2 font-medium text-tk-teal underline underline-offset-4"
 >
 {link.label}
 </a>
 )
}

export function FileBlock({
 files,
 publicId,
}: {
 files: { id: string; name: string; bytes: number }[]
 publicId: string
}) {
 if (!files.length) return <p className="text-[13px] text-ink-3">No files attached.</p>
 return (
 <ul className="grid gap-2">
 {files.map((f) => (
 <li
 key={f.id}
 className="flex items-center gap-3 rounded-lg border border-line bg-well px-3 py-2.5"
 >
 <span className="min-w-0 flex-1 truncate text-[13px] text-tk-onyx">{f.name}</span>
 <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
 {formatBytes(f.bytes)}
 </span>
 <a
 href={`/slink/${publicId}/file/${f.id}`}
 className="rounded-md border border-line px-2.5 py-1 font-['Inter_Tight',sans-serif] text-[11.5px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
 >
 Download
 </a>
 </li>
 ))}
 </ul>
 )
}

function formatBytes(n: number) {
 if (n < 1024) return `${n} B`
 if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
 return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * The credential block. The secret is never in the delivered HTML — pressing
 * Reveal fetches it, and that fetch is logged against this viewer. The
 * watermark is the deterrent: a screenshot leaves with an address on it.
 */
export function CredentialBlock({
 cred,
 blockId,
 publicId,
 viewerEmail,
}: {
 cred: CredentialView
 blockId: string
 publicId: string
 viewerEmail: string
}) {
 const rows: { label: string; value: string }[] = []
 if (cred.url) rows.push({ label:"URL", value: cred.url })
 if (cred.username) rows.push({ label:"Username", value: cred.username })

 return (
 <div className="relative grid gap-2">
 <div
 aria-hidden="true"
 className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden"
 >
 <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] whitespace-nowrap font-['Inter_Tight',sans-serif] text-[26px] font-bold uppercase tracking-[0.12em] text-tk-slate/[0.07]">
 {viewerEmail}
 </span>
 </div>

 {rows.map((r) => (
 <div
 key={r.label}
 className="grid grid-cols-[minmax(90px,120px)_1fr_auto] items-center gap-3 rounded-lg border border-line bg-well px-3 py-2"
 >
 <span className="font-['Inter_Tight',sans-serif] text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
 {r.label}
 </span>
 <span className="break-all font-mono text-[12.5px] text-tk-onyx">{r.value}</span>
 <CopyButton value={r.value} label="Copy" />
 </div>
 ))}

 {cred.hasSecret ? (
 <div className="grid grid-cols-[minmax(90px,120px)_1fr_auto] items-center gap-3 rounded-lg border border-line bg-well px-3 py-2">
 <span className="font-['Inter_Tight',sans-serif] text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
 Secret
 </span>
 <RevealButton blockId={blockId} publicId={publicId} />
 </div>
 ) : null}

 <p className="relative z-20 text-[11.5px] text-ink-3">
 Revealing is recorded against {viewerEmail}.
 </p>
 </div>
 )
}

const ITEM_TONE: Record<string, string> = {
 done:"bg-tk-teal/10 text-tk-teal",
"in progress":"bg-well text-tk-slate",
 blocked:"bg-tk-tomato/10 text-tk-tomato",
 queued:"bg-tk-slate/8 text-ink-3",
}

export function PunchlistBlock({ list }: { list: PunchlistView }) {
 if (!list.items.length) return <p className="text-[13px] text-ink-3">Nothing on the list.</p>
 return (
 <div className="grid">
 {list.items.map((item, i) => (
 <div
 key={item.id}
 className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-line py-2.5 last:border-b-0"
 >
 <span className="font-mono text-[11px] tabular-nums text-ink-3">
 {String(i + 1).padStart(2,"0")}
 </span>
 <span className="text-[13px] text-tk-onyx">
 <span className={item.status ==="done" ?"text-ink-3 line-through" :""}>
 {item.title}
 </span>
 {item.outcome ? (
 <small className="mt-0.5 block text-[11.5px] text-ink-3">{item.outcome}</small>
 ) : null}
 </span>
 <span
 className={`whitespace-nowrap rounded-full px-2.5 py-0.5 font-['Inter_Tight',sans-serif] text-[11px] font-semibold capitalize ${
 ITEM_TONE[item.status] ?? ITEM_TONE.queued
 }`}
 >
 {item.status}
 </span>
 </div>
 ))}
 </div>
 )
}

export function ReportsBlock({ reports }: { reports: ReportView[] }) {
 if (!reports.length) return <p className="text-[13px] text-ink-3">No reports filed yet.</p>
 return (
 <ul className="grid gap-2">
 {reports.map((r) => (
 <li
 key={r.id}
 className="flex items-center gap-3 rounded-lg border border-line bg-well px-3 py-2.5"
 >
 <span className="min-w-0 flex-1 text-[13px] text-tk-onyx">
 {r.title}
 {r.periodLabel ? (
 <small className="mt-0.5 block text-[11.5px] text-ink-3">{r.periodLabel}</small>
 ) : null}
 </span>
 <Link
 href={r.href}
 className="rounded-md border border-line px-2.5 py-1 font-['Inter_Tight',sans-serif] text-[11.5px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
 >
 Open
 </Link>
 </li>
 ))}
 </ul>
 )
}
