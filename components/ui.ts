// Class strings shared by several components, so the look changes in one place.

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"

export const buttonClass = `${base} border border-line bg-surface px-2.5 py-1 text-soft hover:border-line-strong hover:bg-sunken hover:text-ink`

export const primaryButtonClass = `${base} bg-accent px-3 py-1.5 text-white hover:bg-accent-hi`

export const accentButtonClass = `${base} border border-accent/30 bg-accent-soft px-2.5 py-1 text-accent-ink hover:border-accent/60`

export const iconButtonClass = `${base} h-7 w-7 border border-transparent text-muted hover:bg-sunken hover:text-ink`

export const pillClass = (active: boolean) =>
  `${base} rounded-full border px-2.5 py-0.5 ${
    active
      ? "border-accent/40 bg-accent-soft text-accent-ink"
      : "border-line bg-surface text-soft hover:border-line-strong hover:bg-sunken"
  }`

export const inputClass =
  "w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none"

export const selectClass =
  "rounded-md border border-line bg-surface py-1 pl-2 pr-1 text-xs font-medium text-soft hover:border-line-strong focus:border-accent"

export const sectionLabelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted"

// Subtopic colors (defined in style.css), assigned by group order so a group
// heading and its lane in the timeline match.
const GROUP_COLORS = ["--g1", "--g2", "--g3", "--g4", "--g5"]
export const groupColor = (index: number) =>
  `rgb(var(${GROUP_COLORS[index % GROUP_COLORS.length]}))`
