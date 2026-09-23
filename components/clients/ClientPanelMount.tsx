"use client"

import { useEffect } from "react"
import { usePanelSlot } from "@/components/nav/PanelSlot"
import { ClientPanel } from "@/components/clients/ClientPanel"
import type { ClientPanelData, ClientShell } from "@/lib/client-rooms"

/** Puts the client's panel into the dock while this layout is mounted. */
export function ClientPanelMount({ client, data }: { client: ClientShell; data: ClientPanelData }) {
  const { setOverride } = usePanelSlot()
  useEffect(() => {
    setOverride(<ClientPanel client={client} data={data} />)
    return () => setOverride(null)
  }, [client, data, setOverride])
  return null
}
