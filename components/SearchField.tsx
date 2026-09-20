import type { FormEvent } from "react"

import { useT } from "~components/i18n"
import { IconArrowRight, IconSearch } from "~components/icons"

// A search box with a leading magnifier. With `onSubmit` it is a form with a
// go button (topic search); without, it filters as you type (the library).
export function SearchField({
  value,
  onChange,
  placeholder,
  hint,
  onSubmit,
  canSubmit = true
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  hint?: string
  onSubmit?: () => void
  canSubmit?: boolean
}) {
  const t = useT()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit) onSubmit?.()
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="relative min-w-0 flex-1"
      title={hint}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
        <IconSearch size={15} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-9 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {onSubmit && (
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label={t("search.button")}
          title={t("search.button")}
          className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-hi disabled:bg-sunken disabled:text-muted">
          <IconArrowRight size={14} />
        </button>
      )}
    </form>
  )
}
