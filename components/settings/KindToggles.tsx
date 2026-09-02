"use client"

import { useState, useTransition } from "react"
import { saveNotificationKind } from "@/app/(admin)/settings/notifications/actions"

type Kind = { kind: string; title: string; summary: string; on: boolean; ignoresQuietHours: boolean }

export function KindToggles({ kinds }: { kinds: Kind[] }) {
  return (
    <ul className="divide-y divide-tk-slate/10">
      {kinds.map((k) => (
        <KindRow key={k.kind} kind={k} />
      ))}
    </ul>
  )
}

function KindRow({ kind }: { kind: Kind }) {
  const [on, setOn] = useState(kind.on)
  const [pending, start] = useTransition()

  return (
    <li className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-tk-onyx">
          {kind.title}
          {kind.ignoresQuietHours && (
            <span className="ml-2 rounded bg-tk-slate/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tk-slate/70">
              ignores quiet hours
            </span>
          )}
        </div>
        <div className="text-xs text-tk-slate/60">{kind.summary}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={() => {
          const next = !on
          setOn(next)
          start(async () => {
            const result = await saveNotificationKind(kind.kind, next)
            if (!result.ok) setOn(!next)
          })
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-tk-teal" : "bg-tk-slate/25"} disabled:opacity-60`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "left-0.5 translate-x-5" : "left-0.5"}`}
        />
      </button>
    </li>
  )
}
