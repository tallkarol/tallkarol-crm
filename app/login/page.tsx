import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import { LoginForm } from "@/components/LoginForm"

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) redirect("/")

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="text-sm text-tk-slate/70">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
