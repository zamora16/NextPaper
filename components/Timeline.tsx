import type { TimelineData } from "~lib/timeline"

const COLORS = ["#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#f43f5e"]
const WIDTH = 400
const PAD_X = 16
const LANE_HEIGHT = 50
const LABEL_HEIGHT = 14
const AXIS_HEIGHT = 22
const TOP = 16

// One lane per subtopic, papers placed by year (size = citations). Shows what
// a list cannot: which lines of work are classic and which are recent, where
// the heavily cited papers sit, and how the open paper (dashed line) relates
// in time to each subtopic. Hover a dot for its title, click to jump to it.
export function Timeline({
  data,
  seedYear,
  visibleIds,
  selectedId,
  onSelect
}: {
  data: TimelineData
  seedYear?: number | null
  visibleIds: Set<string>
  selectedId: string | null
  onSelect: (paperId: string) => void
}) {
  const height = TOP + data.lanes.length * LANE_HEIGHT + AXIS_HEIGHT
  const span = data.maxYear - data.minYear
  const x = (year: number) =>
    PAD_X + ((year - data.minYear) / span) * (WIDTH - 2 * PAD_X)
  const laneTop = (index: number) => TOP + index * LANE_HEIGHT

  return (
    <div className="flex flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label="Cronología de los papers por subtema"
        className="w-full rounded-lg border border-slate-200 bg-slate-50">
        {data.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={TOP - 4}
              y2={height - AXIS_HEIGHT}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text
              x={x(tick)}
              y={height - 6}
              fontSize="10"
              textAnchor="middle"
              fill="#64748b">
              {tick}
            </text>
          </g>
        ))}

        {data.lanes.map((lane, laneIndex) => {
          const color = COLORS[laneIndex % COLORS.length]
          const top = laneTop(laneIndex)
          const centerY = top + LABEL_HEIGHT + (LANE_HEIGHT - LABEL_HEIGHT) / 2
          return (
            <g key={lane.label}>
              <text
                x={PAD_X}
                y={top + 10}
                fontSize="10"
                fontWeight="600"
                fill={color}>
                {lane.label.length > 44
                  ? lane.label.slice(0, 43) + "…"
                  : lane.label}
              </text>
              <line
                x1={PAD_X}
                x2={WIDTH - PAD_X}
                y1={centerY}
                y2={centerY}
                stroke={color}
                strokeOpacity={0.15}
                strokeWidth={1}
              />
              {lane.dots.map((dot, i) => {
                const selected = dot.paperId === selectedId
                const dimmed = !visibleIds.has(dot.paperId)
                return (
                  <circle
                    key={dot.paperId}
                    data-timeline-point={dot.paperId}
                    cx={x(dot.year)}
                    // alternate above/below the lane line so same-year dots
                    // do not sit exactly on top of each other
                    cy={centerY + ((i % 3) - 1) * 9}
                    r={3.5 + Math.min(7, 2 * Math.log10(1 + dot.citationCount))}
                    fill={color}
                    fillOpacity={dimmed ? 0.12 : 0.6}
                    stroke={selected ? "#0f172a" : color}
                    strokeWidth={selected ? 2.5 : 1}
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer"
                    onClick={() => onSelect(dot.paperId)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && onSelect(dot.paperId)
                    }>
                    <title>
                      {dot.title} ({dot.year}) ·{" "}
                      {dot.citationCount.toLocaleString()} citas
                    </title>
                  </circle>
                )
              })}
            </g>
          )
        })}

        {seedYear && (
          <g>
            <line
              x1={x(seedYear)}
              x2={x(seedYear)}
              y1={TOP - 6}
              y2={height - AXIS_HEIGHT}
              stroke="#0f172a"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={x(seedYear)}
              y={10}
              fontSize="10"
              fontWeight="600"
              textAnchor="middle"
              fill="#0f172a">
              ★ tu paper ({seedYear})
            </text>
          </g>
        )}
      </svg>

      <div className="flex flex-col gap-0.5">
        {data.lanes.map((lane, index) => (
          <span
            key={lane.label}
            className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: COLORS[index % COLORS.length] }}
            />
            <span className="line-clamp-1">
              {lane.label} · {lane.dots.length} ·{" "}
              {lane.minYear === lane.maxYear
                ? lane.minYear
                : `${lane.minYear}–${lane.maxYear}`}{" "}
              (mediana {lane.medianYear})
            </span>
          </span>
        ))}
        {data.undated > 0 && (
          <span className="text-[11px] text-slate-400">
            {data.undated} sin año no aparecen.
          </span>
        )}
      </div>
    </div>
  )
}
