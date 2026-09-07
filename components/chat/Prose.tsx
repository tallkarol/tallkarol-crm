import { Fragment, type ReactNode } from "react"

/**
 * A reply, set as prose.
 *
 * The models answer in light markdown — a paragraph, a list, a `name` in
 * backticks — and rendering that raw is most of what made the old thread
 * feel like a log file. This handles exactly that much: paragraphs, bullet
 * and numbered lists, bold, inline code. Nothing is parsed as HTML; every
 * node is built here, so a reply cannot inject markup.
 */
export function Prose({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/)
  return (
    <div className="flex flex-col gap-2.5 [overflow-wrap:anywhere]">
      {blocks.map((block, i) => (
        <Block key={i} text={block} />
      ))}
    </div>
  )
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/

function Block({ text }: { text: string }) {
  const lines = text.split("\n")
  if (lines.length > 0 && lines.every((line) => BULLET.test(line))) {
    const ordered = /^\s*\d/.test(lines[0])
    const Tag = ordered ? "ol" : "ul"
    return (
      <Tag
        className={
          ordered
            ? "flex list-decimal flex-col gap-1.5 pl-5 marker:font-ui marker:text-[12px] marker:font-semibold marker:text-ink-3"
            : "flex list-disc flex-col gap-1.5 pl-5 marker:text-ink-3"
        }
      >
        {lines.map((line, i) => (
          <li key={i} className="pl-0.5">
            <Inline text={line.replace(BULLET, "")} />
          </li>
        ))}
      </Tag>
    )
  }
  const heading = /^#{1,3}\s+(.*)$/.exec(text.trim())
  if (heading && lines.length === 1) {
    return (
      <p className="font-ui text-[13px] font-semibold text-tk-onyx">
        <Inline text={heading[1]} />
      </p>
    )
  }
  return (
    <p className="whitespace-pre-wrap">
      <Inline text={text} />
    </p>
  )
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE)
  const out: ReactNode[] = []
  parts.forEach((part, i) => {
    if (!part) return
    if (part.startsWith("**") && part.endsWith("**")) {
      out.push(
        <strong key={i} className="font-semibold text-tk-onyx">
          {part.slice(2, -2)}
        </strong>
      )
    } else if (part.startsWith("`") && part.endsWith("`")) {
      out.push(
        <code
          key={i}
          className="rounded-[5px] border border-line bg-card px-[5px] py-px font-mono text-[12.5px]"
        >
          {part.slice(1, -1)}
        </code>
      )
    } else {
      out.push(<Fragment key={i}>{part}</Fragment>)
    }
  })
  return <>{out}</>
}
