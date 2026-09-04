"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  annotateImport,
  commitImport,
  type ImportAnnotation,
} from "@/app/(admin)/expenses/import-actions"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories"
import {
  guessChargesAreNegative,
  parseAnyStatement,
  parseOfx,
  parsePaste,
  parseStatementCsv,
  type StagedRow,
} from "@/lib/import-parse"
import { formatMoney } from "@/lib/work"
import { Card } from "@/components/ui/Card"

type ReviewRow = StagedRow & {
  include: boolean
  vendor: string
  category: string
  clientId: string | null
  duplicate: boolean
  ruleMatched: boolean
}

export function Importer({ clients }: { clients: { id: string; name: string; slug: string }[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [lastFile, setLastFile] = useState<{ name: string; text: string } | null>(null)
  const [chargesNegative, setChargesNegative] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  async function stage(staged: StagedRow[], sourceLabel: string) {
    if (staged.length === 0) {
      setStatus(`Nothing recognizable in ${sourceLabel}. CSV, OFX/QFX, or "date vendor amount" lines work.`)
      return
    }
    setBusy(true)
    setStatus(null)
    const annotations = await annotateImport(
      staged.map((r) => ({
        key: r.key,
        occurredOn: r.occurredOn,
        description: r.description,
        amountCents: r.amountCents,
        sourceKind: r.sourceKind,
      }))
    )
    const byKey = new Map<string, ImportAnnotation>(annotations.map((a) => [a.key, a]))
    setRows(
      staged.map((r) => {
        const a = byKey.get(r.key)
        return {
          ...r,
          include: !r.credit && !(a?.duplicate ?? false),
          vendor: a?.vendor ?? r.description,
          category: a?.category ?? "other",
          clientId: a?.clientId ?? null,
          duplicate: a?.duplicate ?? false,
          ruleMatched: a?.ruleMatched ?? false,
        }
      })
    )
    setBusy(false)
  }

  async function onFile(file: File) {
    const text = await file.text()
    setLastFile({ name: file.name, text })
    const isCsvSingleAmount = file.name.toLowerCase().endsWith(".csv")
    const guess = isCsvSingleAmount ? guessChargesAreNegative(text) : true
    setChargesNegative(guess)
    await stage(parseAnyStatement(file.name, text), file.name)
  }

  async function reparseWithSign(next: boolean) {
    setChargesNegative(next)
    if (!lastFile) return
    if (/\.(ofx|qfx)$/i.test(lastFile.name)) await stage(parseOfx(lastFile.text), lastFile.name)
    else await stage(parseStatementCsv(lastFile.text, next), lastFile.name)
  }

  function patch(key: string, changes: Partial<ReviewRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)))
  }

  async function commit() {
    const selected = rows.filter((r) => r.include)
    if (selected.length === 0) return
    setBusy(true)
    const result = await commitImport(
      selected.map((r) => ({
        occurredOn: r.occurredOn,
        vendor: r.vendor,
        description: r.description,
        amountCents: r.amountCents,
        category: r.category,
        clientId: r.clientId,
        sourceKind: r.sourceKind,
      }))
    )
    setBusy(false)
    if (!result.ok) {
      setStatus(result.error ?? "Import failed.")
      return
    }
    setStatus(`Imported ${result.inserted} expense${result.inserted === 1 ? "" : "s"}. Vendor rules updated.`)
    setRows([])
    setLastFile(null)
    setPasteText("")
    startTransition(() => router.refresh())
  }

  const selected = rows.filter((r) => r.include)
  const selectedCents = selected.reduce((s, r) => s + r.amountCents, 0)
  const skipped = rows.length - selected.length

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold text-tk-onyx">Import statements</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Credit card, debit, or PayPal exports (CSV / OFX / QFX) — or paste receipt
            and invoice lines like “Aug 12 Adobe $54.99”. Everything lands in a review
            queue first.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.ofx,.qfx,.txt"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length === 1) await onFile(files[0])
              else if (files.length > 1) {
                // merge multiple files into one batch
                const all: StagedRow[] = []
                for (const f of files) all.push(...parseAnyStatement(f.name, await f.text()))
                setLastFile(null)
                await stage(all, `${files.length} files`)
              }
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
          >
            Choose files
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
          >
            Paste lines
          </button>
        </div>
      </div>

      {pasteOpen ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={"Aug 12 Adobe receipt $54.99\n8/3 Railway 20.00\nGoDaddy renewal 12/1/2026 $149.17"}
            className="w-full rounded-lg border border-line bg-well px-3 py-2 font-mono text-[13px] focus:border-tk-teal"
          />
          <div>
            <button
              type="button"
              disabled={busy || !pasteText.trim()}
              onClick={() => stage(parsePaste(pasteText), "the pasted text")}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-50"
            >
              Parse lines
            </button>
          </div>
        </div>
      ) : null}

      {status ? <p className="mt-3 text-sm font-medium text-tk-slate">{status}</p> : null}

      {rows.length > 0 ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <p className="font-semibold text-tk-onyx tabular-nums">
              {selected.length} of {rows.length} selected · {formatMoney(selectedCents)}
            </p>
            {skipped > 0 ? (
              <p className="text-xs text-ink-3">
                {skipped} unchecked (duplicates and refunds/credits start excluded)
              </p>
            ) : null}
            {lastFile && !/\.(ofx|qfx)$/i.test(lastFile.name) ? (
              <label className="flex items-center gap-1.5 text-xs text-ink-3">
                <input
                  type="checkbox"
                  checked={chargesNegative}
                  onChange={(e) => reparseWithSign(e.target.checked)}
                  className="accent-tk-teal"
                />
                charges are negative in this file
              </label>
            ) : null}
            <button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={commit}
              className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-50"
            >
              {busy ? "Working…" : `Import ${selected.length}`}
            </button>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-well text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <th className="w-10 px-3 py-2" aria-label="Include" />
                  <th className="w-24 px-2 py-2">Date</th>
                  <th className="w-44 px-2 py-2">Vendor</th>
                  <th className="px-2 py-2">Statement text</th>
                  <th className="w-24 px-2 py-2 text-right">Amount</th>
                  <th className="w-32 px-2 py-2">Category</th>
                  <th className="w-40 px-2 py-2">Client</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    className={cn(
                      "border-b border-line last:border-0",
                      !r.include && "opacity-45"
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => patch(r.key, { include: e.target.checked })}
                        aria-label={`Include ${r.vendor}`}
                        className="accent-tk-teal"
                      />
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-tk-slate">{r.occurredOn.slice(5)}</td>
                    <td className="px-2 py-1.5">
                      <input
                        value={r.vendor}
                        onChange={(e) => patch(r.key, { vendor: e.target.value })}
                        className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 font-medium text-tk-onyx hover:border-line-strong focus:border-tk-teal"
                      />
                    </td>
                    <td className="max-w-0 truncate px-2 py-1.5 text-xs text-ink-3" title={r.description}>
                      {r.description}
                      {r.credit ? <span className="ml-1.5 font-semibold text-emerald-800">refund/credit</span> : null}
                      {r.duplicate ? <span className="ml-1.5 font-semibold text-amber-800">already in expenses</span> : null}
                      {r.ruleMatched && !r.duplicate && !r.credit ? (
                        <span className="ml-1.5 text-tk-teal">rule</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-tk-onyx">
                      {formatMoney(r.amountCents)}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={r.category}
                        onChange={(e) => patch(r.key, { category: e.target.value })}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs hover:border-line-strong focus:border-tk-teal"
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={r.clientId ?? ""}
                        onChange={(e) => patch(r.key, { clientId: e.target.value || null })}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs hover:border-line-strong focus:border-tk-teal"
                        style={r.clientId ? { color: clientColor(clients.find((c) => c.id === r.clientId)?.slug ?? "") } : undefined}
                      >
                        <option value="">overhead</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
