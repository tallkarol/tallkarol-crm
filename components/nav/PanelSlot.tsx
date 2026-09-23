"use client"

import { createContext, useContext, type ReactNode } from "react"

/**
 * Lets a route swap the dock's panel for its own content. AppShell owns the
 * state and renders whatever is set here instead of the group's HubPanel;
 * the client layout sets it on mount and clears it on unmount, so leaving
 * the client restores the group panel without any route bookkeeping.
 */
export type PanelSlotValue = {
  setOverride: (node: ReactNode | null) => void
}

export const PanelSlotContext = createContext<PanelSlotValue>({ setOverride: () => {} })

export function usePanelSlot() {
  return useContext(PanelSlotContext)
}
