import { notFound } from"next/navigation"
import Link from"next/link"
import { requestAccessAction } from"./actions"
import { isPublicId } from"@/lib/slink"
import { slinkByPublicId } from"@/lib/slink-data"

export const dynamic ="force-dynamic"
export const metadata = { title:"Ask for access", robots: { index: false, follow: false } }

/**
 * The honest path for"my colleague needs this too".
 *
 * This page is the reason forwarding a magic link is not the obvious move. If
 * asking properly took longer than forwarding, people would forward — so it is
 * three fields and a button, and Karol decides.
 */
export default async function RequestAccessPage({
 params,
 searchParams,
}: {
 params: { publicId: string }
 searchParams: { done?: string }
}) {
 if (!isPublicId(params.publicId)) notFound()
 const slink = await slinkByPublicId(params.publicId)
 const title = slink && slink.status ==="active" ? slink.title :""

 return (
 <main className="grid min-h-screen place-items-center bg-well px-5 py-10">
 <div className="w-full max-w-md rounded-xl border border-line bg-tk-white p-6">
 <p className="font-['Inter_Tight',sans-serif] text-[11px] font-bold uppercase tracking-[0.22em] text-tk-onyx">
 TALLKAROL
 </p>

 {searchParams.done ? (
 <>
 <h1 className="mt-3 font-['Inter_Tight',sans-serif] text-[20px] font-bold tracking-tight text-tk-onyx">
 Request sent
 </h1>
 <p className="mt-2 text-[13px] text-tk-slate">
 Karol reviews these by hand. If he approves it, a link arrives by email at the
 address you gave.
 </p>
 </>
 ) : (
 <>
 <h1 className="mt-3 font-['Inter_Tight',sans-serif] text-[20px] font-bold tracking-tight text-tk-onyx">
 Ask for access
 </h1>
 {title ? <p className="mt-1 text-[13px] text-ink-3">{title}</p> : null}
 <p className="mt-2 text-[13px] text-tk-slate">
 Every request is approved by hand. Nothing is granted automatically.
 </p>

 <form action={requestAccessAction} className="mt-4 grid gap-3">
 <input type="hidden" name="publicId" value={params.publicId} />
 <Field label="Their email" name="email" type="email" required placeholder="them@company.com" />
 <Field label="Their name" name="name" placeholder="Optional" />
 <div className="grid gap-1.5">
 <label
 htmlFor="reason"
 className="font-['Inter_Tight',sans-serif] text-[11px] font-bold uppercase tracking-[0.09em] text-ink-3"
 >
 Why they need it
 </label>
 <textarea
 id="reason"
 name="reason"
 rows={3}
 className="rounded-lg border border-line bg-well px-3 py-2 text-[13px] text-tk-onyx placeholder:text-ink-3"
 placeholder="Taking over from a colleague, needs the records…"
 />
 </div>
 <button
 type="submit"
 className="rounded-lg bg-accent px-4 py-2.5 font-['Inter_Tight',sans-serif] text-[13px] font-semibold text-white"
 >
 Send the request
 </button>
 </form>
 </>
 )}

 <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-3">
 <Link href={`/slink/${params.publicId}`} className="font-semibold text-tk-teal">
 Back
 </Link>
 </p>
 </div>
 </main>
 )
}

function Field({
 label,
 name,
 type ="text",
 required,
 placeholder,
}: {
 label: string
 name: string
 type?: string
 required?: boolean
 placeholder?: string
}) {
 return (
 <div className="grid gap-1.5">
 <label
 htmlFor={name}
 className="font-['Inter_Tight',sans-serif] text-[11px] font-bold uppercase tracking-[0.09em] text-ink-3"
 >
 {label}
 </label>
 <input
 id={name}
 name={name}
 type={type}
 required={required}
 placeholder={placeholder}
 className="rounded-lg border border-line bg-well px-3 py-2 text-[13px] text-tk-onyx placeholder:text-ink-3"
 />
 </div>
 )
}
