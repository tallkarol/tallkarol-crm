import { Fragment, type ReactNode } from "react"
import { parseProse, type Block, type Inline, type List } from "@/lib/chat/prose"

/**
 * A reply, set as prose.
 *
 * The models answer in light markdown and rendering that raw is most of what
 * made the old thread feel like a log file. The parsing lives in
 * lib/chat/prose.ts (pure, checked); this file only turns its tree into
 * nodes. Nothing is parsed as HTML, so a reply cannot inject markup; the
 * only hrefs are the ones the parser let through — https URLs and paths
 * into the CRM.
 */
export function Prose({ text }: { text: string }) {
  const blocks = parseProse(text.trim())
  return (
    <div className="flex flex-col gap-2.5 [overflow-wrap:anywhere]">
      {blocks.map((block, i) => (
        <BlockNode key={i} block={block} />
      ))}
    </div>
  )
}

function BlockNode({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      return (
        <p className="font-ui text-[13px] font-semibold text-tk-onyx">
          <InlineNodes nodes={block.children} />
        </p>
      )
    case "list":
      return <ListNode list={block} />
    case "table":
      return (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th
                    key={i}
                    className="border-b border-line-strong px-2 py-1 text-left font-ui text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3"
                  >
                    <InlineNodes nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-line px-2 py-1 align-top">
                      <InlineNodes nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case "quote":
      return (
        <blockquote className="flex flex-col gap-2 border-l-2 border-line-strong pl-3 text-ink-2">
          {block.children.map((child, i) => (
            <BlockNode key={i} block={child} />
          ))}
        </blockquote>
      )
    case "code":
      return (
        <pre
          className="max-w-full overflow-x-auto rounded-lg border border-line bg-card px-3 py-2 font-mono text-[12px] leading-[1.5] text-tk-onyx"
          data-language={block.language || undefined}
        >
          <code>{block.text}</code>
        </pre>
      )
    case "rule":
      return <hr className="border-0 border-t border-line" />
    default:
      return (
        <p className="whitespace-pre-wrap">
          <InlineNodes nodes={block.children} />
        </p>
      )
  }
}

function ListNode({ list }: { list: List }) {
  const Tag = list.ordered ? "ol" : "ul"
  return (
    <Tag
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={
        list.ordered
          ? "flex list-decimal flex-col gap-1.5 pl-5 marker:font-ui marker:text-[12px] marker:font-semibold marker:text-ink-3"
          : "flex list-disc flex-col gap-1.5 pl-5 marker:text-ink-3"
      }
    >
      {list.items.map((item, i) => (
        <li key={i} className="pl-0.5 whitespace-pre-wrap">
          {item.checked !== null ? (
            <span className="mr-1.5 font-mono text-[12px] text-ink-3" aria-label={item.checked ? "done" : "open"}>
              {item.checked ? "☑" : "☐"}
            </span>
          ) : null}
          <InlineNodes nodes={item.children} />
          {item.sub ? (
            <div className="mt-1.5">
              <ListNode list={item.sub} />
            </div>
          ) : null}
        </li>
      ))}
    </Tag>
  )
}

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  const out: ReactNode[] = []
  nodes.forEach((node, i) => {
    switch (node.kind) {
      case "bold":
        out.push(
          <strong key={i} className="font-semibold text-tk-onyx">
            <InlineNodes nodes={node.children} />
          </strong>
        )
        break
      case "italic":
        out.push(
          <em key={i}>
            <InlineNodes nodes={node.children} />
          </em>
        )
        break
      case "code":
        out.push(
          <code key={i} className="rounded-[5px] border border-line bg-card px-[5px] py-px font-mono text-[12.5px]">
            {node.text}
          </code>
        )
        break
      case "link":
        out.push(
          <a
            key={i}
            href={node.href}
            rel={node.external ? "noopener noreferrer" : undefined}
            target={node.external ? "_blank" : undefined}
            className="text-accent-ink underline decoration-line-strong underline-offset-2 hover:decoration-accent-ink"
          >
            <InlineNodes nodes={node.children} />
          </a>
        )
        break
      default:
        out.push(<Fragment key={i}>{node.text}</Fragment>)
    }
  })
  return <>{out}</>
}
