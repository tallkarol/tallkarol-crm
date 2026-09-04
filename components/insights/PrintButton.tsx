"use client"

/** The PDF is the browser's print-to-PDF of this page — no extra pipeline. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90 print:hidden"
    >
      Save as PDF
    </button>
  )
}
