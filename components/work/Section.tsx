export function Section({
  title,
  children,
  empty,
}: {
  title: string
  children?: React.ReactNode
  empty?: boolean
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="border-b border-tk-slate/10 px-5 py-3">
        <h2 className="text-sm font-semibold text-tk-onyx">{title}</h2>
      </div>
      {empty ? (
        <p className="px-5 py-8 text-sm text-tk-slate/70">Nothing here yet.</p>
      ) : (
        children
      )}
    </section>
  )
}
