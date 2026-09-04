import { Suspense } from "react"
import { PageHeader } from "@/components/PageHeader"
import { InboxConsole } from "@/components/inbox/InboxConsole"
import { loadInbox } from "@/lib/inbox-data"

export const metadata = { title: "Inbox" }
export const dynamic = "force-dynamic"

export default async function InboxPage() {
  const data = await loadInbox()

  return (
    <>
      <PageHeader title="Inbox" />
      <p className="mt-1 text-[11.5px] text-ink-3">
        {data.counts.unread > 0
          ? `${data.counts.unread} unread`
          : "Nothing unread"}
        {data.counts.reply > 0 ? ` · ${data.counts.reply} waiting on a reply` : ""}
      </p>

      <Suspense fallback={<p className="mt-8 text-sm text-ink-3">Loading…</p>}>
        <InboxConsole data={data} />
      </Suspense>
    </>
  )
}
