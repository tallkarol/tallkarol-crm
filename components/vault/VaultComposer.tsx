"use client"

import { useRef } from "react"
import { addVaultEntry } from "@/app/(admin)/vault/actions"
import { VAULT_KIND_LABEL, VAULT_KINDS } from "@/lib/vault"

type ClientOption = { id: string; name: string }

export function VaultComposer({ clients }: { clients: ClientOption[] }) {
  const form = useRef<HTMLFormElement>(null)

  return (
    <section className="mt-6 rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-tk-onyx">Save a credential</h2>
      <form
        ref={form}
        action={async (formData) => {
          await addVaultEntry(formData)
          form.current?.reset()
        }}
        autoComplete="off"
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="block text-sm lg:col-span-2">
          <span className="text-xs font-medium text-tk-slate/70">What for</span>
          <input
            name="title"
            required
            placeholder="Shopify admin, Railway, GDI VIP…"
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-tk-slate/70">Kind</span>
          <select name="kind" defaultValue="login" className={fieldClass}>
            {VAULT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {VAULT_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-tk-slate/70">Client</span>
          <select name="clientId" defaultValue="" className={fieldClass}>
            <option value="">Workspace</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-xs font-medium text-tk-slate/70">URL</span>
          <input
            name="url"
            placeholder="admin.shopify.com"
            className={fieldClass}
          />
        </label>
        <label className="block text-sm lg:col-span-2">
          <span className="text-xs font-medium text-tk-slate/70">Username</span>
          <input name="username" autoComplete="off" className={fieldClass} />
        </label>
        <label className="block text-sm lg:col-span-2">
          <span className="text-xs font-medium text-tk-slate/70">
            Password / secret
          </span>
          <input
            name="secret"
            type="password"
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
          >
            Save
          </button>
        </div>
        <label className="block text-sm sm:col-span-2 lg:col-span-6">
          <span className="text-xs font-medium text-tk-slate/70">
            Note (optional)
          </span>
          <input
            name="notes"
            placeholder="Which store, which env, who it belongs to"
            className={fieldClass}
          />
        </label>
      </form>
    </section>
  )
}

const fieldClass =
  "mt-1 w-full rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
