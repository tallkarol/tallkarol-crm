import { hideMoney, MASK_DIGITS } from "@/lib/money-privacy"

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string
  defaultValue: string
}

/**
 * A form field holding a money amount. In demo mode the real value still
 * submits — as a hidden input, so the form saves unchanged — while the visible
 * field shows dots. Not `type="password"` (password managers offer to save
 * it) and not CSS text-security (Firefox lacks it, and the number would still
 * sit in the DOM on a shared screen). No hooks, so it renders on either side.
 */
export function MoneyInput({ name, defaultValue, ...rest }: Props) {
  if (!hideMoney()) return <input name={name} defaultValue={defaultValue} {...rest} />
  const { placeholder: _p, inputMode: _i, required: _r, ...visible } = rest
  return (
    <>
      <input type="hidden" name={name} value={defaultValue} />
      <input {...visible} readOnly value={MASK_DIGITS} data-money aria-label="Amount hidden in demo mode" />
    </>
  )
}
