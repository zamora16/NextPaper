import { dot, meanVector, normalize } from "~lib/vector-math"

// 2-D map of high-dimensional embeddings via PCA. With n ≤ ~25 vectors it is
// cheaper and simpler to eigen-decompose the n×n Gram matrix (power iteration
// with deflation) than the 768×768 covariance matrix.

// Deterministic start vector so the map never jitters between runs.
function seeded(n: number): number[] {
  let s = 12345
  return Array.from({ length: n }, () => ((s = (s * 16807) % 2147483647) / 2147483647) + 0.5)
}

function topEigen(matrix: number[][], iterations = 200): { vector: number[]; value: number } {
  const n = matrix.length
  let v = normalize(seeded(n))

  for (let i = 0; i < iterations; i++) {
    const w = matrix.map((row) => dot(row, v))
    const next = normalize(w)
    if (next.every((x) => x === 0)) break
    v = next
  }

  const value = dot(v, matrix.map((row) => dot(row, v)))
  return { vector: v, value }
}

// Returns one [x, y] per input vector, uniformly scaled into [-1, 1] and
// rounded to 3 decimals (small enough to store with the result). Distances are
// meaningful: papers on the same topic land close together.
export function project2D(vectors: number[][]): [number, number][] {
  const n = vectors.length
  if (n === 0) return []
  if (n === 1) return [[0, 0]]

  const unit = vectors.map(normalize)
  const mean = meanVector(unit)
  const centered = unit.map((v) => v.map((x, i) => x - mean[i]))

  const gram = centered.map((a) => centered.map((b) => dot(a, b)))
  const first = topEigen(gram)

  // Deflate the first component to find the second.
  const deflated = gram.map((row, i) =>
    row.map((x, j) => x - first.value * first.vector[i] * first.vector[j])
  )
  const second = topEigen(deflated)

  // Sign convention: the largest coordinate of each axis is positive.
  const orient = (v: number[]) => {
    const peak = v.reduce((best, x) => (Math.abs(x) > Math.abs(best) ? x : best), 0)
    return peak < 0 ? v.map((x) => -x) : v
  }
  const x = orient(first.vector).map((c) => c * Math.sqrt(Math.max(first.value, 0)))
  const y = orient(second.vector).map((c) => c * Math.sqrt(Math.max(second.value, 0)))

  const extent = Math.max(...x.map(Math.abs), ...y.map(Math.abs)) || 1
  const round = (value: number) => Math.round((value / extent) * 1000) / 1000
  return x.map((cx, i) => [round(cx), round(y[i])])
}
