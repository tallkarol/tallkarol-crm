import type { Client } from "@/db/schema"
import { PortalTabs } from "@/components/portal/PortalTabs"
import { exitPortalPreview } from "@/app/portal/actions"

/** The one surface clients ever see — TALLKAROL branded, nothing internal. */
export function PortalShell({
  displayName,
  clients,
  preview,
  children,
}: {
  displayName: string
  clients: Client[]
  preview: boolean
  children: React.ReactNode
}) {
  const context = clients.map((c) => c.name).join(" · ")
  const initial = (displayName[0] ?? "?").toUpperCase()
  return (
    <div className="min-h-screen bg-tk-linen">
      {preview ? (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-amber-700/90 px-4 py-1.5 text-center text-xs font-semibold text-white">
          Previewing the client portal as {context || "—"} — clients see exactly this
          <form action={exitPortalPreview}>
            <button className="rounded-full border border-white/50 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-white/10">
              Exit preview
            </button>
          </form>
        </div>
      ) : null}
      <header className="bg-tk-onyx text-tk-linen">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3.5 px-6 pt-4">
          <span className="font-['Inter_Tight',sans-serif] text-sm font-bold tracking-[0.22em]">
            TALL<span className="text-[#7BD1C8]">KAROL</span>
          </span>
          <span className="h-4 w-px bg-tk-linen/25" aria-hidden />
          <span className="text-xs text-tk-linen/75">Client Portal{context ? ` · ${context}` : ""}</span>
          <span className="ml-auto flex items-center gap-2.5 text-[12.5px] font-semibold">
            <span className="grid size-6 place-items-center rounded-full bg-[#7BD1C8] text-xs font-bold text-tk-onyx">
              {initial}
            </span>
            {displayName}
          </span>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3 pt-2">
          <PortalTabs />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-7">{children}</main>
      <footer className="mx-auto max-w-5xl px-6 pb-10 text-xs text-tk-slate/50">
        Questions? Reply to any email from Karol, or open a ticket — it lands directly on his desk.
      </footer>
    </div>
  )
}
