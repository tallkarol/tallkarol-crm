import Link from "next/link"

/**
 * A document the producing tool already rendered (the launch audit ships its
 * own HTML, client and internal versions). Shown in a sandboxed frame so its
 * stylesheet cannot leak into the CRM and nothing in it can run against us.
 */
export function RenderedDoc({ html, view, base }: { html: { handoff?: string; internal?: string }; view: "handoff" | "internal"; base: string }) {
  const doc = view === "internal" ? html.internal : html.handoff
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {(["handoff", "internal"] as const).map((v) => (
          <Link
            key={v}
            href={`${base}&view=${v}`}
            className={
              v === view
                ? "rounded-full bg-tk-onyx px-3 py-1 text-xs font-semibold text-tk-linen"
                : "rounded-full border border-line px-3 py-1 text-xs font-semibold text-tk-onyx hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            }
          >
            {v === "handoff" ? "Client handoff" : "Internal"}
          </Link>
        ))}
      </div>
      {doc ? (
        <iframe
          title={`${view} report`}
          sandbox=""
          srcDoc={doc}
          className="h-[calc(100vh-14rem)] w-full rounded-2xl border border-line bg-card"
        />
      ) : (
        <p className="text-sm text-ink-3">This run has no {view} version.</p>
      )}
    </div>
  )
}
