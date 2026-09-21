import { describe, expect, it } from "vitest"

import { type PaperGroup, type ScoredPaper } from "~lib/model"
import { buildTimeline } from "~lib/timeline"

const paper = (
  id: string,
  year: number | null,
  citationCount = 1
): ScoredPaper =>
  ({ paperId: id, title: `Paper ${id}`, year, citationCount }) as ScoredPaper

const groups: PaperGroup[] = [
  {
    label: "Classic",
    papers: [paper("a", 2010, 900), paper("b", 2012), paper("c", 2014)]
  },
  {
    label: "Emerging",
    papers: [paper("d", 2023), paper("e", 2025, 3), paper("f", 2024)]
  }
]

describe("buildTimeline", () => {
  it("makes one lane per subtopic with its own year span and median", () => {
    const data = buildTimeline(groups)!
    expect(data.lanes.map((l) => l.label)).toEqual(["Classic", "Emerging"])
    expect(data.lanes[0]).toMatchObject({
      minYear: 2010,
      maxYear: 2014,
      medianYear: 2012
    })
    expect(data.lanes[1]).toMatchObject({
      minYear: 2023,
      maxYear: 2025,
      medianYear: 2024
    })
  })

  it("orders each lane's papers by year", () => {
    const data = buildTimeline([
      {
        label: "X",
        papers: [
          paper("z", 2020),
          paper("y", 2015),
          paper("w", 2018),
          paper("v", 2016)
        ]
      }
    ])!
    expect(data.lanes[0].dots.map((d) => d.year)).toEqual([
      2015, 2016, 2018, 2020
    ])
  })

  it("spans all lanes and picks round axis ticks inside the range", () => {
    const data = buildTimeline(groups)!
    expect([data.minYear, data.maxYear]).toEqual([2010, 2025])
    expect(data.ticks.length).toBeGreaterThanOrEqual(3)
    expect(data.ticks.length).toBeLessThanOrEqual(6)
    for (const tick of data.ticks) {
      expect(tick).toBeGreaterThanOrEqual(2010)
      expect(tick).toBeLessThanOrEqual(2025)
    }
  })

  it("widens the axis to include the open paper's year", () => {
    expect(buildTimeline(groups, 2027)!.maxYear).toBe(2027)
    expect(buildTimeline(groups, 2005)!.minYear).toBe(2005)
    expect(buildTimeline(groups, 2015)!.minYear).toBe(2010)
  })

  it("skips undated papers and counts them", () => {
    const data = buildTimeline([
      {
        label: "A",
        papers: [paper("1", 2020), paper("2", null), paper("3", 2021)]
      },
      {
        label: "B",
        papers: [paper("4", 2022), paper("5", null), paper("6", 2019)]
      }
    ])!
    expect(data.undated).toBe(2)
    expect(data.lanes.flatMap((l) => l.dots)).toHaveLength(4)
  })

  it("drops lanes with no dated paper", () => {
    const data = buildTimeline([
      { label: "Undated", papers: [paper("u", null)] },
      {
        label: "Dated",
        papers: [
          paper("1", 2020),
          paper("2", 2021),
          paper("3", 2022),
          paper("4", 2023)
        ]
      }
    ])!
    expect(data.lanes.map((l) => l.label)).toEqual(["Dated"])
  })

  it("returns null when there is too little dated data to be meaningful", () => {
    expect(
      buildTimeline([
        { label: "A", papers: [paper("1", 2020), paper("2", 2021)] }
      ])
    ).toBeNull()
    expect(buildTimeline([])).toBeNull()
  })

  it("does not collapse the axis when every paper shares one year", () => {
    const data = buildTimeline([
      {
        label: "A",
        papers: [
          paper("1", 2020),
          paper("2", 2020),
          paper("3", 2020),
          paper("4", 2020)
        ]
      }
    ])!
    expect(data.maxYear).toBeGreaterThan(data.minYear)
  })

  it("uses sensible tick steps for wide and narrow ranges", () => {
    const wide = buildTimeline([
      {
        label: "A",
        papers: [
          paper("1", 1970),
          paper("2", 1990),
          paper("3", 2010),
          paper("4", 2024)
        ]
      }
    ])!
    expect(wide.ticks.every((t) => t % 10 === 0 || t % 20 === 0)).toBe(true)
    const narrow = buildTimeline([
      {
        label: "A",
        papers: [
          paper("1", 2022),
          paper("2", 2023),
          paper("3", 2024),
          paper("4", 2025)
        ]
      }
    ])!
    expect(narrow.ticks).toEqual([2022, 2023, 2024, 2025])
  })
})
