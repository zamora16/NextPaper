import { useEffect, useState } from "react"

import { useT } from "~components/i18n"
import { buttonClass, pillClass, selectClass } from "~components/ui"
import { isRangeActive, lastYears, type Range } from "~lib/view"

const MIN_CITATIONS = [0, 10, 50, 100, 500]

// "1990" is a year; "19" is a year being typed (undefined: do not apply yet);
// an empty box removes the bound.
export function parseYear(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === "") return null
  return /^\d{4}$/.test(trimmed) ? Number(trimmed) : undefined
}

function YearBox({
  value,
  label,
  onChange
}: {
  value: number | null
  label: string
  onChange: (year: number | null) => void
}) {
  const [text, setText] = useState(value === null ? "" : String(value))

  // The presets and "clear" change the value from outside.
  useEffect(() => {
    setText((current) =>
      parseYear(current) === value
        ? current
        : value === null
          ? ""
          : String(value)
    )
  }, [value])

  return (
    <input
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        const year = parseYear(event.target.value)
        if (year !== undefined) onChange(year)
      }}
      inputMode="numeric"
      maxLength={4}
      placeholder={label}
      aria-label={label}
      aria-invalid={parseYear(text) === undefined}
      className="w-[4.5rem] rounded-md border border-line bg-surface px-2 py-1 text-center text-xs tabular-nums text-ink placeholder:text-muted focus:border-accent focus:outline-none aria-[invalid=true]:border-danger"
    />
  )
}

// Extra filters kept out of the way until asked for: year range and a minimum
// number of citations.
export function RangeFilters({
  range,
  onChange
}: {
  range: Range
  onChange: (patch: Partial<Range>) => void
}) {
  const t = useT()
  const yearSet = range.yearFrom !== null || range.yearTo !== null
  const preset = (years: number) => {
    const { yearFrom } = lastYears(years)
    return range.yearFrom === yearFrom && range.yearTo === null
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-sunken p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-xs font-medium text-soft">
          {t("filters.year")}
        </span>
        <YearBox
          value={range.yearFrom}
          label={t("filters.year.from")}
          onChange={(yearFrom) => onChange({ yearFrom })}
        />
        <span className="text-muted">–</span>
        <YearBox
          value={range.yearTo}
          label={t("filters.year.to")}
          onChange={(yearTo) => onChange({ yearTo })}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[5, 10].map((years) => (
          <button
            key={years}
            onClick={() => onChange({ ...lastYears(years) })}
            aria-pressed={preset(years)}
            className={pillClass(preset(years))}>
            {t(years === 5 ? "filters.last5" : "filters.last10")}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-soft">
        <span className="w-20">{t("filters.minCitations")}</span>
        <select
          value={range.minCitations}
          onChange={(event) =>
            onChange({ minCitations: Number(event.target.value) })
          }
          className={selectClass}>
          {MIN_CITATIONS.map((n) => (
            <option key={n} value={n}>
              {n === 0
                ? t("filters.minCitations.any")
                : t("filters.minCitations.n", { n })}
            </option>
          ))}
        </select>
      </label>

      {yearSet && (
        <p className="text-[11px] leading-snug text-muted">
          {t("filters.noYear")}
        </p>
      )}

      {isRangeActive(range) && (
        <button
          onClick={() =>
            onChange({ yearFrom: null, yearTo: null, minCitations: 0 })
          }
          className={`${buttonClass} self-start`}>
          {t("filters.clear")}
        </button>
      )}
    </div>
  )
}
