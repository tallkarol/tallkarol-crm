"use client"

import { Dropdown, MenuHead, MenuLabel, MenuOption, MenuRule } from "@/components/ui/Dropdown"
import {
  LADDERS,
  MODELS,
  PICKABLE_JOBS,
  type LadderPick,
  type ModelKey,
  type PickableJob,
} from "@/lib/chat/models"

/**
 * Which ladder this send starts on.
 *
 * Auto is the default and still classifies from the text. Elevate skips the
 * cheap first pass of whatever Auto would have picked. A named job forces
 * that ladder on a free thread; a slash command, a solve or a desk keeps
 * its own job and only the model moves.
 */
export function LadderPicker({
  value,
  onChange,
}: {
  value: LadderPick
  onChange: (pick: LadderPick) => void
}) {
  const forced = value !== "auto"
  const { title, hint } = chipCopy(value)

  return (
    <div className="ml-auto">
      <Dropdown
        variant="chip"
        align="right"
        placement="up"
        on={forced}
        title={
          value === "auto"
            ? "The ladder picks the model from what you ask. Elevate skips the cheap first pass."
            : value === "elevate"
              ? "This send starts on the top rung of whatever Auto would have picked."
              : `This send runs on ${LADDERS[value].label}.`
        }
        label={
          <>
            {title}
            <span className={`font-mono text-[11px] font-medium ${forced ? "text-tk-linen/75" : "text-ink-3"}`}>
              {hint}
            </span>
          </>
        }
      >
        {(close) => (
          <>
            <MenuHead>Ladder</MenuHead>
            <MenuOption
              checked={value === "auto"}
              label="Auto ladder"
              count="default"
              onSelect={() => {
                onChange("auto")
                close()
              }}
            />
            <MenuOption
              checked={value === "elevate"}
              label="Elevate"
              count="skip cheap"
              onSelect={() => {
                onChange("elevate")
                close()
              }}
            />
            <MenuRule />
            <MenuLabel>Force</MenuLabel>
            {PICKABLE_JOBS.map((job) => {
              const ladder = LADDERS[job]
              return (
                <MenuOption
                  key={job}
                  checked={value === job}
                  label={ladder.label}
                  count={modelHint(ladder.rungs[0])}
                  onSelect={() => {
                    onChange(job)
                    close()
                  }}
                />
              )
            })}
          </>
        )}
      </Dropdown>
    </div>
  )
}

function chipCopy(pick: LadderPick): { title: string; hint: string } {
  if (pick === "auto") return { title: "Auto", hint: "ladder" }
  if (pick === "elevate") return { title: "Elevate", hint: "forced" }
  return { title: CHIP[pick], hint: "forced" }
}

function modelHint(key: ModelKey): string {
  return MODELS[key].label
    .replace("Grok 4.6 ", "Grok ")
    .replace("Composer 2.5", "Composer")
    .replace("Fable 5.1 ", "Fable ")
    .replace("Opus 5 ", "Opus ")
    .replace("GPT-5.6 Sol ", "Sol ")
}

const CHIP: Record<PickableJob, string> = {
  chat: "Chat",
  trivial_edit: "Trivial",
  content_edit: "Content",
  build_fix: "Build",
  code_tested: "Code",
  code_fable: "Fable code",
  code_opus: "Opus code",
  debug: "Debug",
  review: "Review",
  review_critical: "Critical",
  security_review: "Security",
  architecture: "Architecture",
  writing: "Writing",
  report: "Report",
}
