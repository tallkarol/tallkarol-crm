import { addBoard } from "@/app/(admin)/inspiration/actions"
import { Card } from "@/components/ui/Card"

export function NewBoardForm() {
  return (
    <Card className="p-4">
      <form
        action={addBoard}
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <label className="block text-sm">
          <span className="text-xs font-medium text-ink-3">New board</span>
          <input
            name="title"
            required
            placeholder="Modern websites, type, motion…"
            className="mt-1 h-[38px] w-full rounded-lg border border-line bg-well px-2.5 text-[13px] text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal focus:bg-card"
          />
        </label>
        <button
          type="submit"
          className="h-[38px] rounded-lg bg-tk-onyx px-3.5 text-[13px] font-semibold text-white hover:bg-accent"
        >
          Create
        </button>
      </form>
    </Card>
  )
}
