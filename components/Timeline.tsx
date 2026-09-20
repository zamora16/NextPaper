import { groupLabel, useT } from "~components/i18n"
import type { TimelineData } from "~lib/timeline"

const INK = "rgb(var(--ink))"
const GRID = "rgb(var(--line))"
const MUTED = "rgb(var(--muted))"
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
  colorOf,
  onSelect
}: {
  data: TimelineData
  seedYear?: number | null
  visibleIds: Set<string>
  selectedId: string | null
  // The color of a subtopic, the same one its heading has in the list.
  colorOf: (label: string) => string
  onSelect: (paperId: string) => void
}) {
  const t = useT()
  const height = TOP + data.lanes.length * LANE_HEIGHT + AXIS_HEIGHT
  const span = data.maxYear - data.minYear
  const x = (year: number) =>
    PAD_X + ((year - data.minYear) / span) * (WIDTH - 2 * PAD_X)
  const laneTop = (index: number) => TOP + index * LANE_HEIGHT

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] leading-snug text-muted">
        {t("timeline.legend")}
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={t("timeline.aria")}
        className="w-full rounded-xl border border-line bg-surface">
        {data.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={TOP - 4}
              y2={height - AXIS_HEIGHT}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={x(tick)}
              y={height - 6}
              fontSize="10"
              textAnchor="middle"
              fill={MUTED}>
              {tick}
            </text>
          </g>
        ))}

        {data.lanes.map((lane, laneIndex) => {
          const color = colorOf(lane.label)
          const top = laneTop(laneIndex)
          const centerY = top + LABEL_HEIGHT + (LANE_HEIGHT - LABEL_HEIGHT) / 2
          const label = groupLabel(lane.label, t)
          return (
            <g key={lane.label}>
              <text
                x={PAD_X}
                y={top + 10}
                fontSize="10"
                fontWeight="600"
                fill={color}>
                {label.length > 44 ? label.slice(0, 43) + "…" : label}
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
                    stroke={selected ? INK : color}
                    strokeWidth={selected ? 2.5 : 1}
                    tabIndex={0}
                    role="button"
                    aria-label={t("timeline.tooltip", {
                      title: dot.title,
                      year: dot.year,
                      citations: t("card.citations", { n: dot.citationCount })
                    })}
                    className="cursor-pointer"
                    onClick={() => onSelect(dot.paperId)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && onSelect(dot.paperId)
                    }>
                    <title>
                      {t("timeline.tooltip", {
                        title: dot.title,
                        year: dot.year,
                        citations: t("card.citations", {
                          n: dot.citationCount
                        })
                      })}
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
              stroke={INK}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={x(seedYear)}
              y={10}
              fontSize="10"
              fontWeight="600"
              textAnchor="middle"
              fill={INK}>
              {t("timeline.you", { year: seedYear })}
            </text>
          </g>
        )}
      </svg>

      <div className="flex flex-col gap-0.5">
        {data.lanes.map((lane, index) => (
          <span
            key={lane.label}
            className="flex items-center gap-1.5 text-[11px] text-muted">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: colorOf(lane.label) }}
            />
            <span className="line-clamp-1">
              {groupLabel(lane.label, t)} · {lane.dots.length} ·{" "}
              {lane.minYear === lane.maxYear
                ? lane.minYear
                : `${lane.minYear}–${lane.maxYear}`}{" "}
              ({t("timeline.median", { year: lane.medianYear })})
            </span>
          </span>
        ))}
        {data.undated > 0 && (
          <span className="text-[11px] text-muted">
            {t("timeline.undated", { n: data.undated })}
          </span>
        )}
      </div>
    </div>
  )
}
