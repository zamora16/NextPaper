// The k-means the extension used to group papers, kept as the baseline of the
// stability audit (docs/EVALUATION.md): it was replaced by hierarchical
// clustering because it regrouped too easily. Written from scratch:
// k-means++ starts, Lloyd's iterations on L2-normalized vectors (so Euclidean
// clustering behaves like clustering by cosine), and a fixed seed.
import { mergeSmallClusters, silhouetteScore } from "~lib/clustering"
import { euclideanDistance, meanVector, normalize } from "~lib/vector-math"

// Seeded PRNG (mulberry32), so a run is reproducible.
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

    const changed = newCentroids.some(
      (c, i) => euclideanDistance(c, centroids[i]) > 1e-6
    )
    centroids = newCentroids
    if (!changed) break
  }

  return assignments
}

// k-means for k in 2..maxK, the best silhouette wins (what the extension did).
export function kMeansAuto(vectors: number[][], minK = 2, maxK = 4): number[] {
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
