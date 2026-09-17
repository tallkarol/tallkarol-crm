import type { ActivityModule, KindSpec, ModuleKey } from "@/lib/activity/define"
import { actions } from "@/lib/activity/modules/actions"
import { controls } from "@/lib/activity/modules/controls"
import { devices } from "@/lib/activity/modules/devices"
import { errors } from "@/lib/activity/modules/errors"
import { frustration } from "@/lib/activity/modules/frustration"
import { navigation } from "@/lib/activity/modules/navigation"
import { pages } from "@/lib/activity/modules/pages"
import { peeks } from "@/lib/activity/modules/peeks"
import { portal } from "@/lib/activity/modules/portal"
import { vitals } from "@/lib/activity/modules/vitals"

/** Registry order is the Modules tab's order. A new module is a file plus one line here — no migration. */
export const MODULES: readonly ActivityModule[] = [
  pages,
  navigation,
  controls,
  peeks,
  actions,
  errors,
  vitals,
  frustration,
  devices,
  portal,
]

export type ModuleFlags = Record<ModuleKey, boolean>

export const KINDS: Record<string, { module: ModuleKey; spec: KindSpec }> = {}
for (const mod of MODULES) {
  for (const kind of Object.keys(mod.kinds)) {
    KINDS[kind] = { module: mod.key, spec: mod.kinds[kind] }
  }
}

export function isModuleKey(value: string): value is ModuleKey {
  return MODULES.some((m) => m.key === value)
}

export function moduleByKey(key: ModuleKey): ActivityModule {
  const found = MODULES.find((m) => m.key === key)
  if (!found) throw new Error(`unknown activity module ${key}`)
  return found
}

/** The switches the browser probe reads — the modules it captures itself. */
export function probeModules(flags: ModuleFlags) {
  return {
    pages: flags.pages,
    navigation: flags.navigation,
    controls: flags.controls,
    peeks: flags.peeks,
    errors: flags.errors,
    vitals: flags.vitals,
    frustration: flags.frustration,
  }
}

/** Stored switches merged over the defaults. A module that is not available is off whatever is stored. */
export function resolveFlags(stored: Partial<Record<string, unknown>> | null | undefined): ModuleFlags {
  const flags = {} as ModuleFlags
  for (const mod of MODULES) {
    const value = stored?.[mod.key]
    flags[mod.key] = mod.available && (typeof value === "boolean" ? value : mod.defaultOn)
  }
  return flags
}
