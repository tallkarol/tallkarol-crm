"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { copyToClipboard, copyWhenReady } from "@/components/support/CopyButton"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { VAULT_KIND_LABEL, VAULT_KINDS, type VaultEntryView } from "@/lib/vault"
import {
  deleteVaultEntry,
  revealVaultSecret,
  updateVaultEntry,
} from "@/app/(admin)/vault/actions"

type ClientOption = { id: string; name: string }

type CopyTarget = "user" | "secret"

export function VaultRow({
  entry,
  clients,
}: {
  entry: VaultEntryView
  clients: ClientOption[]
}) {
  const [editing, setEditing] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<{
    target: CopyTarget
    state: "done" | "error"
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secretRequest = useRef<Promise<string | null> | null>(null)

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
  }, [])

  const flash = (target: CopyTarget, state: "done" | "error") => {
    setCopyState({ target, state })
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyState(null), 1600)
  }

  const chipState = (target: CopyTarget) =>
    copyState?.target === target ? copyState.state : "idle"

  /**
   * One request per row, shared by copy and reveal. It deliberately does not
   * touch `secret` state — copying a password should not also put it on screen.
   * A failed load is not cached, so the next click retries.
   */
  const loadSecret = () => {
    if (secret != null) return Promise.resolve(secret)
    if (!secretRequest.current) {
      secretRequest.current = revealVaultSecret(entry.id)
        .then((result) => (result.ok && result.secret ? result.secret : null))
        .catch(() => null)
        .then((value) => {
          if (value == null) secretRequest.current = null
          return value
        })
    }
    return secretRequest.current
  }

  const copySecret = () => {
    // No await before this call — see copyWhenReady. Awaiting the server action
    // first spends the click's user gesture and the browser refuses the write.
    void copyWhenReady(loadSecret()).then((ok) =>
      flash("secret", ok ? "done" : "error")
    )
  }

  const copyUsername = async () => {
    if (!entry.username) return
    const ok = await copyToClipboard(entry.username)
    flash("user", ok ? "done" : "error")
  }

  if (editing) {
    return (
      <li className="px-5 py-4">
        <form
          action={(formData) => {
            startTransition(async () => {
              await updateVaultEntry(formData)
              setEditing(false)
              setSecret(null)
              // The stored secret may have just changed — drop the cached one.
              secretRequest.current = null
            })
          }}
          className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <input type="hidden" name="id" value={entry.id} />
          <Field label="What for" className="lg:col-span-2">
            <input
              name="title"
              required
              defaultValue={entry.title}
              className={fieldClass}
            />
          </Field>
          <Field label="Kind">
            <select name="kind" defaultValue={entry.kind} className={fieldClass}>
              {VAULT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {VAULT_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Client">
            <select
              name="clientId"
              defaultValue={entry.client?.id ?? ""}
              className={fieldClass}
            >
              <option value="">Workspace</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="URL" className="sm:col-span-2">
            <input name="url" defaultValue={entry.url} className={fieldClass} />
          </Field>
          <Field label="Username" className="lg:col-span-2">
            <input
              name="username"
              defaultValue={entry.username}
              className={fieldClass}
            />
          </Field>
          <Field
            label={entry.hasSecret ? "New secret (blank keeps current)" : "Secret"}
            className="lg:col-span-2"
          >
            <input
              name="secret"
              type="password"
              autoComplete="off"
              className={fieldClass}
            />
          </Field>
          <Field label="Note" className="sm:col-span-2 lg:col-span-6">
            <input
              name="notes"
              defaultValue={entry.notes}
              className={fieldClass}
            />
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-line px-3.5 py-1.5 text-[13px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{
          background: entry.client
            ? clientColor(entry.client.slug)
            : "rgba(15,22,21,.25)",
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="truncate font-medium text-tk-onyx hover:text-tk-teal"
            >
              {entry.title}
            </a>
          ) : (
            <span className="truncate font-medium text-tk-onyx">{entry.title}</span>
          )}
          <span className="rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold text-ink-3">
            {VAULT_KIND_LABEL[entry.kind]}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-3">
          {entry.username || "no username"}
          {entry.notes ? ` · ${entry.notes}` : ""}
        </span>
        {secret != null && secret !== "" ? (
          <span className="mt-1 block break-all font-mono text-[12px] text-tk-onyx">
            {secret}
          </span>
        ) : null}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {entry.username ? (
          <button
            type="button"
            onClick={copyUsername}
            className={chipClass(chipState("user") === "done")}
          >
            {chipState("user") === "done"
              ? "copied"
              : chipState("user") === "error"
                ? "failed"
                : "user"}
          </button>
        ) : null}
        {entry.hasSecret ? (
          <>
            <button
              type="button"
              onClick={copySecret}
              className={chipClass(chipState("secret") === "done")}
            >
              {chipState("secret") === "done"
                ? "copied"
                : chipState("secret") === "error"
                  ? "failed"
                  : "copy"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (secret != null) {
                  setSecret(null)
                  return
                }
                startTransition(() => {
                  void loadSecret().then((value) => {
                    if (value == null) flash("secret", "error")
                    else setSecret(value)
                  })
                })
              }}
              className={chipClass(false)}
            >
              {secret != null ? "hide" : "reveal"}
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={chipClass(false)}
        >
          edit
        </button>
        <form
          action={deleteVaultEntry}
          onSubmit={(event) => {
            if (!window.confirm(`Delete “${entry.title}”?`)) {
              event.preventDefault()
            }
          }}
        >
          <input type="hidden" name="id" value={entry.id} />
          <button
            type="submit"
            aria-label={`Delete ${entry.title}`}
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-3 hover:text-red-700"
          >
            ✕
          </button>
        </form>
      </div>
    </li>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      {children}
    </label>
  )
}

const fieldClass =
  "mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm focus:border-tk-teal"

function chipClass(done: boolean) {
  return cn(
    "rounded-md border px-2 py-0.5 font-mono text-[10.5px]",
    done
      ? "border-tk-teal bg-accent text-tk-linen"
      : "border-line text-ink-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
  )
}
