import { Section } from "@/components/work/Section"
import type {
  ContractBlock,
  ContractSchedule,
  ContractTerms,
} from "@/lib/contract"
import { formatMoney } from "@/lib/work"

function Prose({ children }: { children: string }) {
  return <p className="text-sm leading-relaxed text-tk-slate/80">{children}</p>
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-tk-slate/80">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function Block({ block }: { block: ContractBlock }) {
  return (
    <div className="border-t border-tk-slate/10 px-5 py-4 first:border-t-0">
      <h3 className="text-sm font-semibold text-tk-onyx">{block.heading}</h3>
      {block.paragraphs?.map((paragraph) => (
        <div key={paragraph.slice(0, 48)} className="mt-2">
          <Prose>{paragraph}</Prose>
        </div>
      ))}
      {block.bullets ? <Bullets items={block.bullets} /> : null}
      {block.note ? (
        <p className="mt-2 text-sm leading-relaxed text-tk-slate/70">
          {block.note}
        </p>
      ) : null}
      {block.blocks?.map((child) => (
        <div key={child.heading} className="mt-4">
          <h4 className="text-sm font-semibold text-tk-onyx">{child.heading}</h4>
          {child.paragraphs?.map((paragraph) => (
            <div key={paragraph.slice(0, 48)} className="mt-2">
              <Prose>{paragraph}</Prose>
            </div>
          ))}
          {child.bullets ? <Bullets items={child.bullets} /> : null}
          {child.note ? (
            <p className="mt-2 text-sm leading-relaxed text-tk-slate/70">
              {child.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function Schedule({ schedule }: { schedule: ContractSchedule }) {
  return (
    <Section title={schedule.title}>
      {schedule.subtitle ? (
        <p className="border-b border-tk-slate/10 px-5 py-3 text-sm text-tk-slate/70">
          {schedule.subtitle}
        </p>
      ) : null}
      {schedule.paragraphs?.map((paragraph) => (
        <div key={paragraph.slice(0, 48)} className="px-5 py-3">
          <Prose>{paragraph}</Prose>
        </div>
      ))}
      {schedule.allocations?.map((item) => (
        <div
          key={item.label}
          className="border-t border-tk-slate/10 px-5 py-4 first:border-t-0"
        >
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-semibold text-tk-onyx">{item.label}</h3>
            {item.amountCents != null ? (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-tk-onyx">
                {formatMoney(item.amountCents)}
              </span>
            ) : null}
          </div>
          <Bullets items={item.bullets} />
          {item.note ? (
            <p className="mt-2 text-sm leading-relaxed text-tk-slate/70">
              {item.note}
            </p>
          ) : null}
        </div>
      ))}
      {schedule.tables?.map((table) => (
        <div key={table.title ?? table.columns.join()} className="px-5 py-4">
          {table.title ? (
            <h3 className="mb-3 text-sm font-semibold text-tk-onyx">
              {table.title}
            </h3>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-tk-slate/15 text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
                  {table.columns.map((column) => (
                    <th key={column} className="pb-2 pr-4 font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr
                    key={row.join("|")}
                    className="border-b border-tk-slate/10 align-top last:border-b-0"
                  >
                    {row.map((cell, index) => (
                      <td
                        key={`${cell}-${index}`}
                        className="py-2.5 pr-4 text-tk-slate/80"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {schedule.lists?.map((list) => (
        <div key={list.title} className="border-t border-tk-slate/10 px-5 py-4">
          <h3 className="text-sm font-semibold text-tk-onyx">{list.title}</h3>
          <Bullets items={list.items} />
        </div>
      ))}
      {schedule.note ? (
        <p className="border-t border-tk-slate/10 px-5 py-3 text-sm font-semibold text-tk-onyx">
          {schedule.note}
        </p>
      ) : null}
    </Section>
  )
}

export function ContractBody({ terms }: { terms: ContractTerms }) {
  return (
    <>
      {terms.parties && terms.parties.length > 0 ? (
        <Section title="Parties">
          <dl className="divide-y divide-tk-slate/10">
            {terms.parties.map((party) => (
              <div
                key={`${party.role}-${party.name}`}
                className="flex items-start justify-between gap-4 px-5 py-3"
              >
                <dt className="text-sm text-tk-slate/70">{party.role}</dt>
                <dd className="text-right text-sm font-medium text-tk-onyx">
                  {party.name}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {terms.preamble && terms.preamble.length > 0 ? (
        <Section title="Agreement">
          <div className="space-y-3 px-5 py-4">
            {terms.preamble.map((paragraph) => (
              <Prose key={paragraph.slice(0, 48)}>{paragraph}</Prose>
            ))}
          </div>
        </Section>
      ) : null}

      {terms.milestones && terms.milestones.length > 0 ? (
        <Section title="Payment schedule">
          <ul className="divide-y divide-tk-slate/10">
            {terms.milestones.map((row) => (
              <li
                key={row.label}
                className="flex items-start justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tk-onyx">{row.label}</p>
                  <p className="mt-0.5 text-sm text-tk-slate/70">{row.trigger}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-tk-onyx">
                  {formatMoney(row.amountCents)}
                </span>
              </li>
            ))}
          </ul>
          {terms.paymentDue ? (
            <p className="border-t border-tk-slate/10 px-5 py-3 text-sm leading-relaxed text-tk-slate/70">
              {terms.paymentDue}
            </p>
          ) : null}
          {terms.extraRateNote ? (
            <p className="border-t border-tk-slate/10 px-5 py-3 text-sm leading-relaxed text-tk-slate/70">
              {terms.extraRateNote}
            </p>
          ) : null}
        </Section>
      ) : null}

      {terms.sections && terms.sections.length > 0 ? (
        <Section title="Terms">
          {terms.sections.map((section) => (
            <Block key={section.heading} block={section} />
          ))}
        </Section>
      ) : null}

      {terms.schedules?.map((schedule) => (
        <Schedule key={schedule.title} schedule={schedule} />
      ))}

      {terms.operatingCosts && terms.operatingCosts.length > 0 ? (
        <Section title="Estimated monthly operating costs">
          {terms.operatingCostsNote ? (
            <p className="px-5 py-3 text-sm leading-relaxed text-tk-slate/70">
              {terms.operatingCostsNote}
            </p>
          ) : null}
          <ul className="divide-y divide-tk-slate/10">
            {terms.operatingCosts.map((row) => (
              <li
                key={row.label}
                className="flex items-start justify-between gap-4 px-5 py-3"
              >
                <p className="text-sm text-tk-onyx">{row.label}</p>
                <span className="shrink-0 text-sm tabular-nums text-tk-slate/80">
                  {row.amount}
                </span>
              </li>
            ))}
          </ul>
          {terms.operatingCostsTotal ? (
            <p className="border-t border-tk-slate/10 px-5 py-3 text-sm font-semibold text-tk-onyx">
              Total estimated monthly cost: {terms.operatingCostsTotal}
            </p>
          ) : null}
        </Section>
      ) : null}

      {terms.signatures && terms.signatures.length > 0 ? (
        <Section title="Signatures">
          <dl className="divide-y divide-tk-slate/10">
            {terms.signatures.map((party) => (
              <div
                key={`${party.role}-${party.name}`}
                className="flex items-start justify-between gap-4 px-5 py-3"
              >
                <dt className="text-sm text-tk-slate/70">{party.role}</dt>
                <dd className="text-right text-sm font-medium text-tk-onyx">
                  {party.name}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {terms.source ? (
        <p className="mt-4 text-xs text-tk-slate/50">{terms.source}</p>
      ) : null}
    </>
  )
}
