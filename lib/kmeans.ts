import { euclideanDistance, meanVector, normalize } from "~lib/vector-math"

// Seeded PRNG (mulberry32) so clustering is deterministic across renders —
// a plain Math.random() init would re-cluster differently on every popup
// open even for the same recommendations.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function kMeansPlusPlusInit(
  vectors: number[][],
  k: number,
  rng: () => number
): number[][] {
  const centroids: number[][] = [vectors[Math.floor(rng() * vectors.length)]]

  while (centroids.length < k) {
    const distances = vectors.map((v) =>
      Math.min(...centroids.map((c) => euclideanDistance(v, c) ** 2))
    )
    const total = distances.reduce((a, b) => a + b, 0)

    if (total === 0) {
      centroids.push(vectors[Math.floor(rng() * vectors.length)])
      continue
    }

    let threshold = rng() * total
    let chosen = vectors[vectors.length - 1]
    for (let i = 0; i < vectors.length; i++) {
      threshold -= distances[i]
      if (threshold <= 0) {
        chosen = vectors[i]
        break
      }
    }
    centroids.push(chosen)
  }

  return centroids
}

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

// Lloyd's algorithm on L2-normalized vectors, which makes Euclidean
// clustering behave like clustering by cosine similarity.
export function kMeans(
  rawVectors: number[][],
  k: number,
  maxIterations = 25
): number[] {
  const vectors = rawVectors.map(normalize)
  const effectiveK = Math.min(k, vectors.length)
  const rng = mulberry32(42)

  let centroids = kMeansPlusPlusInit(vectors, effectiveK, rng)
  let assignments = new Array(vectors.length).fill(0)

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false

    assignments = vectors.map((v) => {
      let bestIndex = 0
      let bestDist = Infinity
      centroids.forEach((c, i) => {
        const d = euclideanDistance(v, c)
        if (d < bestDist) {
          bestDist = d
          bestIndex = i
        }
      })
      return bestIndex
    })

    const newCentroids = centroids.map((centroid, i) => {
      const members = vectors.filter((_, idx) => assignments[idx] === i)
      return members.length > 0 ? normalize(meanVector(members)) : centroid
    })

    changed = newCentroids.some(
      (c, i) => euclideanDistance(c, centroids[i]) > 1e-6
    )
    centroids = newCentroids

    if (!changed) break
  }

  return assignments
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

// Picks the number of clusters by maximizing the silhouette score instead of
// guessing it from the number of papers.
export function clusterAuto(vectors: number[][], minK = 2, maxK = 4): number[] {
  const upper = Math.min(maxK, Math.floor(vectors.length / 2))
  let best: number[] = new Array(vectors.length).fill(0)
  let bestScore = -Infinity

  for (let k = minK; k <= upper; k++) {
    const candidate = mergeSmallClusters(vectors, kMeans(vectors, k))
    const score = silhouetteScore(vectors, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}
