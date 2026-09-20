// Class strings shared by several components, so the look changes in one place.

export const buttonClass =
  "rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"

export const pillClass = (active: boolean) =>
  `rounded-full border px-2 py-0.5 text-xs font-medium ${
    active
      ? "border-violet-300 bg-violet-50 text-violet-700"
      : "border-slate-200 text-slate-500 hover:bg-slate-50"
  }`

export const primaryButtonClass =
  "rounded bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
