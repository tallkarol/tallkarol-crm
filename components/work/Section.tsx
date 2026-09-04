export function Section({
  title,
  children,
  empty,
  allowOverflow = false,
}: {
  title: string
  children?: React.ReactNode
  empty?: boolean
  /** Let popovers inside escape the card — clipped menus otherwise. */
  allowOverflow?: boolean
}) {
  return (
    <section
      className={`mt-6 rounded-2xl border border-line bg-card shadow-card ${
        allowOverflow ? "" : "overflow-hidden"
      }`}
    >
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-tk-onyx">{title}</h2>
      </div>
      {empty ? (
        <p className="px-5 py-8 text-sm text-ink-3">Nothing here yet.</p>
      ) : (
        children
      )}
    </section>
  )
}
