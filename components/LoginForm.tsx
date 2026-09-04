"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"

export function LoginForm() {
  const search = useSearchParams()
  const error = search.get("error")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("sending")
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error("request failed")
      setStatus("sent")
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-tk-slate/15 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-tk-onyx">
        Tall Karol CRM
      </h1>
      <p className="mt-2 text-sm text-tk-slate/70">
        Sign in with a magic link. No password.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-tk-teal/30 bg-tk-teal/10 px-3 py-2 text-sm text-tk-teal">
          {error === "invalid" || error === "missing"
            ? "That sign-in link is invalid or expired. Request a new one."
            : "Something went wrong. Try again."}
        </p>
      )}

      {status === "sent" ? (
        <p className="mt-6 rounded-lg border border-tk-teal/30 bg-tk-teal/10 px-3 py-3 text-sm text-tk-teal">
          If that email is on the allowlist, a sign-in link is on its way. Check
          your inbox.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-tk-onyx"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm focus:border-tk-teal"
              placeholder="you@tallkarol.com"
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-full bg-tk-teal px-4 py-2.5 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Email me a link"}
          </button>
          {status === "error" && (
            <p className="text-sm text-tk-teal">
              Could not send the link. Try again.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
