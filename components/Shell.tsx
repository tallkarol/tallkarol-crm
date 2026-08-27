import Link from "next/link"
import { logoutAction } from "@/lib/actions"

export function Shell({
  email,
  children,
}: {
  email: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-tk-slate/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold text-tk-onyx">
              Tall Karol CRM
            </Link>
            <nav className="text-sm text-tk-slate/70">
              <Link href="/" className="hover:text-tk-teal hover:underline">
                Inquiries
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-tk-slate/70">
            <span className="hidden sm:inline">{email}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
