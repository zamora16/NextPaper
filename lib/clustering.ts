import {
  cosineSimilarity,
  euclideanDistance,
  meanVector,
  normalize
} from "~lib/vector-math"

// Reassigns members of clusters smaller than minSize to the nearest remaining
// cluster centroid, so a lone outlier doesn't become its own "group".
export function mergeSmallClusters(
  rawVectors: number[][],
  assignments: number[],
  minSize = 2
): number[] {
  const vectors = rawVectors.map(normalize)
  const sizes = new Map<number, number>()
  assignments.forEach((a) => sizes.set(a, (sizes.get(a) ?? 0) + 1))

  const keep = [...sizes.entries()]
    .filter(([, size]) => size >= minSize)
    .map(([cluster]) => cluster)
  if (keep.length === 0 || keep.length === sizes.size) return assignments

  const centroids = new Map(
    keep.map((c) => [
      c,
      normalize(meanVector(vectors.filter((_, i) => assignments[i] === c)))
    ])
  )

  return assignments.map((a, i) => {
    if (centroids.has(a)) return a
    let best = keep[0]
    let bestDist = Infinity
    for (const [c, centroid] of centroids) {
      const d = euclideanDistance(vectors[i], centroid)
      if (d < bestDist) {
        bestDist = d
        best = c
      }
    }
    return best
  })
}

// Mean silhouette coefficient in [-1, 1]: how much closer each point is to its
// own cluster than to the nearest other one. Higher means better separated.
export function silhouetteScore(
  rawVectors: number[][],
  assignments: number[]
): number {
  const vectors = rawVectors.map(normalize)
  if (new Set(assignments).size < 2) return -1

  let total = 0
  vectors.forEach((x, i) => {
    const byCluster = new Map<number, { sum: number; n: number }>()
    vectors.forEach((y, j) => {
      if (i === j) return
      const entry = byCluster.get(assignments[j]) ?? { sum: 0, n: 0 }
      entry.sum += euclideanDistance(x, y)
      entry.n++
      byCluster.set(assignments[j], entry)
    })

    const own = byCluster.get(assignments[i])
    if (!own) return // singleton cluster contributes 0
    const a = own.sum / own.n
    let b = Infinity
    for (const [cluster, entry] of byCluster) {
      if (cluster !== assignments[i]) b = Math.min(b, entry.sum / entry.n)
    }
    total += (b - a) / Math.max(a, b)
  })

  return total / vectors.length
}

// Groups vectors by agglomerative clustering with average linkage on cosine
// distance: start with every paper alone and keep merging the two closest
// groups. Among the states with minK..maxK groups, the one with the best
// silhouette wins (the number of groups is not guessed).
//
// Chosen over k-means by measurement (docs/EVALUATION.md): on the 18 papers
// closest to a paper, regrouping after dropping a tenth of them kept the same
// groups far better (adjusted Rand index 0.75 against 0.44), and it is
// deterministic with no random start. Fewer than 4 vectors: one group.
export function clusterAuto(vectors: number[][], minK = 2, maxK = 4): number[] {
  const n = vectors.length
  let best: number[] = new Array(n).fill(0)
  if (Math.min(maxK, Math.floor(n / 2)) < minK) return best

  const distance = (a: number, b: number) =>
    1 - cosineSimilarity(vectors[a], vectors[b])
  let clusters: number[][] = vectors.map((_, i) => [i])
  let bestScore = -Infinity

  while (clusters.length > minK) {
    let pair: [number, number] = [0, 1]
    let nearest = Infinity
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        let sum = 0
        for (const a of clusters[i]) {
          for (const b of clusters[j]) sum += distance(a, b)
        }
        const d = sum / (clusters[i].length * clusters[j].length)
        if (d < nearest) {
          nearest = d
          pair = [i, j]
        }
      }
    }
    const [i, j] = pair
    clusters = [
      ...clusters.filter((_, x) => x !== i && x !== j),
      [...clusters[i], ...clusters[j]]
    ]

    if (clusters.length <= maxK) {
      const assignments = new Array(n).fill(0)
      clusters.forEach((members, id) =>
        members.forEach((m) => (assignments[m] = id))
      )
      const merged = mergeSmallClusters(vectors, assignments)
      const score = silhouetteScore(vectors, merged)
      if (score > bestScore) {
        bestScore = score
        best = merged
      }
    }
  }

  return best
}
