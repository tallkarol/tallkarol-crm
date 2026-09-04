import { PageHeader } from "@/components/PageHeader"
import { Card } from "@/components/ui/Card"

export function ComingSoon({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <>
      <PageHeader title={title} />
      <Card surface="well" className="mt-10 flex min-h-[22rem] flex-col items-center justify-center border-dashed px-6 text-center">
        <p className="text-sm font-semibold text-tk-onyx">Nothing here yet</p>
        <p className="mt-1 max-w-sm text-sm text-ink-3">
          {description ??
            "This route is in the nav so the product can take shape. It stays empty until the shell feels right."}
        </p>
      </Card>
    </>
  )
}
