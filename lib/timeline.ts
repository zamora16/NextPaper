import type { PaperGroup } from "~lib/pipeline"

// Data for the timeline chart: one lane per subtopic group, papers placed by
// publication year. It answers what a list cannot show at a glance: which
// subtopics are classic and which are recent, where the heavily cited work
// sits, and how the open paper relates in time to each line of work.

export interface TimelineDot {
  paperId: string
  title: string
  year: number
  citationCount: number
}

export interface TimelineLane {
  label: string
  dots: TimelineDot[]
  minYear: number
  maxYear: number
  medianYear: number
}

export interface TimelineData {
  lanes: TimelineLane[]
  minYear: number
  maxYear: number
  // Round years for the axis.
  ticks: number[]
  // Papers left out because Semantic Scholar has no publication year for them.
  undated: number
}

const MIN_DATED_PAPERS = 4

const median = (sorted: number[]) => {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

// Chooses 3-6 evenly spaced round years within the range.
function axisTicks(min: number, max: number): number[] {
  const range = max - min
  const step = [1, 2, 5, 10, 20, 50].find((s) => range / s <= 5) ?? 100
  const ticks: number[] = []
  for (let year = Math.ceil(min / step) * step; year <= max; year += step) {
    ticks.push(year)
  }
  return ticks
}

// `seedYear` widens the axis so the open paper's marker is always inside it.
export function buildTimeline(
  groups: PaperGroup[],
  seedYear?: number | null
): TimelineData | null {
  let undated = 0
  const lanes: TimelineLane[] = []

  for (const group of groups) {
    const dots = group.papers.flatMap((paper): TimelineDot[] => {
      if (!paper.year) {
        undated++
        return []
      }
      return [
        {
          paperId: paper.paperId,
          title: paper.title,
          year: paper.year,
          citationCount: paper.citationCount
        }
      ]
    })
    if (dots.length === 0) continue

    const years = dots.map((d) => d.year).sort((a, b) => a - b)
    lanes.push({
      label: group.label,
      dots: dots.sort((a, b) => a.year - b.year),
      minYear: years[0],
      maxYear: years[years.length - 1],
      medianYear: median(years)
    })
  }

  const total = lanes.reduce((sum, lane) => sum + lane.dots.length, 0)
  if (total < MIN_DATED_PAPERS) return null

  const all = lanes.flatMap((lane) => [lane.minYear, lane.maxYear])
  if (seedYear) all.push(seedYear)
  let minYear = Math.min(...all)
  let maxYear = Math.max(...all)
  // A single year would collapse the axis to a point.
  if (minYear === maxYear) {
    minYear -= 1
    maxYear += 1
  }

  return { lanes, minYear, maxYear, ticks: axisTicks(minYear, maxYear), undated }
}
