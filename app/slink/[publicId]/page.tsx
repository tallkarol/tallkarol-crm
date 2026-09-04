import { notFound } from"next/navigation"
import Link from"next/link"
import { db } from"@/db"
import { PortalInsights } from"@/components/portal/insights-panels"
import {
 BlockShell,
 CredentialBlock,
 FieldsBlock,
 FileBlock,
 LinkBlock,
 PunchlistBlock,
 ReportsBlock,
 TableBlock,
 TableCsvAction,
 TextBlock,
} from"@/components/slink/Blocks"
import { clients as clientsTable } from"@/db/schema"
import { eq } from"drizzle-orm"
import { isPublicId, timeLeftLabel, type BlockKind } from"@/lib/slink"
import { authorize, listBlocks, listFiles, logEvent, slinkByPublicId } from"@/lib/slink-data"
import { credentialFor, punchlistFor, reportsFor } from"@/lib/slink-live"
import { readSlinkCookie, requestFingerprint } from"@/lib/slink-auth"

export const dynamic ="force-dynamic"
export const metadata = { title:"Shared securely", robots: { index: false, follow: false } }

const REASONS: Record<string, string> = {
 missing:"That link had no token in it. Ask for a fresh one below.",
 unknown:"That link is not one we recognise. Ask for a fresh one below.",
 used:"That link has already been used. They work once — ask for a fresh one below.",
 expired:"That link timed out. They last 15 minutes — ask for a fresh one below.",
 revoked:"Your access to this has been withdrawn.",
 lapsed:"Your access has ended. Ask below and it can be restored.",
}

/**
 * What a recipient sees.
 *
 * The gate is `authorize()`, which re-checks the grant on every load rather
 * than trusting the cookie. Anyone without a live session gets the same page
 * as anyone with a bad handle: a way to ask for a link, and nothing that
 * confirms what is behind the door.
 */
export default async function SlinkPage({
 params,
 searchParams,
}: {
 params: { publicId: string }
 searchParams: { e?: string }
}) {
 if (!isPublicId(params.publicId)) notFound()

 const session = readSlinkCookie()
 const auth = await authorize(params.publicId, session)

 if (!auth) {
 // Never confirm whether the slink exists — the locked page is identical
 // for a wrong handle and for a lapsed grant.
 const slink = await slinkByPublicId(params.publicId)
 return (
 <Locked
 publicId={params.publicId}
 title={slink && slink.status ==="active" ? slink.title :""}
 reason={searchParams.e ? REASONS[searchParams.e] ??"" :""}
 />
 )
 }

 const { slink, recipient } = auth
 const now = new Date()
 const { ip, userAgent } = requestFingerprint()
 await logEvent({ slinkId: slink.id, recipientId: recipient.id, kind:"viewed", ip, userAgent })

 const [blocks, files] = await Promise.all([listBlocks(slink.id), listFiles(slink.id)])
 const client = slink.clientId
 ? await db.query.clients.findFirst({ where: eq(clientsTable.id, slink.clientId) })
 : null

 return (
 <main className="min-h-screen bg-well">
 <header className="border-b border-line bg-tk-white px-5 py-6">
 <div className="mx-auto grid max-w-3xl gap-2">
 <p className="font-['Inter_Tight',sans-serif] text-[11px] font-bold uppercase tracking-[0.22em] text-tk-onyx">
 TALLKAROL
 </p>
 <h1 className="font-['Inter_Tight',sans-serif] text-[23px] font-bold tracking-tight text-tk-onyx">
 {slink.title}
 </h1>
 <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px]">
 <Badge tone="mute">Shared with {recipient.email}</Badge>
 {client ? <Badge tone="mute">{client.name}</Badge> : null}
 <Badge tone={recipient.expiresAt ?"warn" :"ok"}>
 {timeLeftLabel(recipient.expiresAt, now)}
 </Badge>
 </div>
 </div>
 </header>

 <div className="mx-auto grid max-w-3xl gap-4 px-5 py-6">
 {slink.intro ? (
 <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-tk-slate">
 {slink.intro}
 </p>
 ) : null}

 <div className="flex flex-wrap items-center gap-3 rounded-xl border border-tk-teal/25 bg-tk-teal/8 px-4 py-3 text-[12.5px] text-tk-slate">
 <span className="flex-1">
 This page stays put. Only your access expires, and asking for it back costs nothing.
 </span>
 <ResendForm publicId={params.publicId} email={recipient.email} label="Send me a fresh link" />
 </div>

 {blocks.map(async (block) => {
 const kind = block.kind as BlockKind
 const blockFiles = files.filter((f) => f.blockId === block.id)

 if (kind ==="text") {
 return (
 <BlockShell key={block.id} title={block.title} kind={kind} note={block.note}>
 <TextBlock data={block.data} />
 </BlockShell>
 )
 }
 if (kind ==="table") {
 return (
 <BlockShell
 key={block.id}
 title={block.title}
 kind={kind}
 note={block.note}
 action={<TableCsvAction data={block.data} />}
 >
 <TableBlock data={block.data} />
 </BlockShell>
 )
 }
 if (kind ==="fields") {
 return (
 <BlockShell key={block.id} title={block.title} kind={kind} note={block.note}>
 <FieldsBlock data={block.data} />
 </BlockShell>
 )
 }
 if (kind ==="link") {
 return (
 <BlockShell key={block.id} title={block.title} kind={kind} note={block.note}>
 <LinkBlock data={block.data} />
 </BlockShell>
 )
 }
 if (kind ==="file") {
 return (
 <BlockShell key={block.id} title={block.title} kind={kind} note={block.note}>
 <FileBlock files={blockFiles} publicId={params.publicId} />
 </BlockShell>
 )
 }
 if (kind ==="credential") {
 const cred = await credentialFor(block)
 if (!cred) return null
 return (
 <BlockShell key={block.id} title={cred.title} kind={kind} note={block.note}>
 <CredentialBlock
 cred={cred}
 blockId={block.id}
 publicId={params.publicId}
 viewerEmail={recipient.email}
 />
 </BlockShell>
 )
 }
 if (kind ==="punchlist") {
 const list = await punchlistFor(block)
 if (!list) return null
 return (
 <BlockShell
 key={block.id}
 title={block.title || list.title}
 kind={kind}
 note={block.note || list.intro}
 action={
 <Badge tone="mute">
 {list.done} of {list.total} done
 </Badge>
 }
 >
 <PunchlistBlock list={list} />
 </BlockShell>
 )
 }
 if (kind ==="reports") {
 const rows = await reportsFor(block)
 return (
 <BlockShell key={block.id} title={block.title ||"Reports"} kind={kind} note={block.note}>
 <ReportsBlock reports={rows} />
 </BlockShell>
 )
 }
 if (kind ==="dashboard") {
 if (!client) return null
 return (
 <BlockShell key={block.id} title={block.title ||"Site health"} kind={kind} note={block.note}>
 <div className="-mx-1">
 <PortalInsights clients={[client]} />
 </div>
 </BlockShell>
 )
 }
 return null
 })}

 <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-tk-white px-4 py-3 text-[12.5px] text-tk-slate">
 <span className="flex-1">
 <b className="text-tk-onyx">This link is personal to you.</b> Forwarding it will not
 work, because it is tied to your email address.
 </span>
 <Link
 href={`/slink/${params.publicId}/request`}
 className="rounded-md border border-line px-2.5 py-1 font-['Inter_Tight',sans-serif] text-[11.5px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
 >
 Someone else needs access
 </Link>
 </div>
 </div>
 </main>
 )
}

function Badge({ tone, children }: { tone:"ok" |"warn" |"mute"; children: React.ReactNode }) {
 const tones = {
 ok:"bg-tk-teal/12 text-tk-teal",
 warn:"bg-tk-tomato/10 text-tk-tomato",
 mute:"bg-tk-slate/8 text-ink-3",
 }
 return (
 <span
 className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-['Inter_Tight',sans-serif] text-[11px] font-semibold ${tones[tone]}`}
 >
 {children}
 </span>
 )
}

/** Asking for a fresh link. Answers the same way whether or not the address is known. */
function ResendForm({
 publicId,
 email,
 label,
}: {
 publicId: string
 email?: string
 label: string
}) {
 return (
 <form action={`/slink/${publicId}/resend`} method="post" className="flex flex-wrap gap-2">
 {email ? (
 <input type="hidden" name="email" value={email} />
 ) : (
 <input
 type="email"
 name="email"
 required
 placeholder="you@company.com"
 className="w-56 rounded-md border border-line bg-tk-white px-2.5 py-1.5 text-[13px] text-tk-onyx placeholder:text-ink-3"
 />
 )}
 <button
 type="submit"
 className="rounded-md bg-accent px-3 py-1.5 font-['Inter_Tight',sans-serif] text-[12px] font-semibold text-white"
 >
 {label}
 </button>
 </form>
 )
}

function Locked({
 publicId,
 title,
 reason,
}: {
 publicId: string
 title: string
 reason: string
}) {
 return (
 <main className="grid min-h-screen place-items-center bg-well px-5 py-10">
 <div className="w-full max-w-md rounded-xl border border-line bg-tk-white p-6">
 <p className="font-['Inter_Tight',sans-serif] text-[11px] font-bold uppercase tracking-[0.22em] text-tk-onyx">
 TALLKAROL
 </p>
 <h1 className="mt-3 font-['Inter_Tight',sans-serif] text-[20px] font-bold tracking-tight text-tk-onyx">
 {title ||"This link needs a fresh key"}
 </h1>
 {reason ? <p className="mt-2 text-[13px] text-tk-slate">{reason}</p> : null}
 <p className="mt-2 text-[13px] text-tk-slate">
 Enter the address this was shared with and a new link is on its way. Nothing behind it
 has changed or been deleted.
 </p>
 <div className="mt-4">
 <ResendForm publicId={publicId} label="Email me a link" />
 </div>
 <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-3">
 Not your address?{""}
 <Link href={`/slink/${publicId}/request`} className="font-semibold text-tk-teal">
 Ask for access
 </Link>
 .
 </p>
 </div>
 </main>
 )
}
