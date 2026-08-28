import { PageHeader } from "@/components/PageHeader"

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="mt-10 flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-tk-onyx">Nothing here yet</p>
        <p className="mt-1 max-w-sm text-sm text-tk-slate/70">
          This route is in the nav so the product can take shape. It stays empty
          until the shell feels right.
        </p>
      </div>
    </>
  )
}
