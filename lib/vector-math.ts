export function dot(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a))
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const denominator = norm(a) * norm(b)
  return denominator === 0 ? 0 : dot(a, b) / denominator
}

// K-means minimizes Euclidean distance, which is only equivalent to cosine
// similarity once every vector has unit length — so we normalize before
// clustering embeddings.
export function normalize(a: number[]): number[] {
  const n = norm(a)
  return n === 0 ? a : a.map((x) => x / n)
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

export function meanVector(vectors: number[][]): number[] {
  const dim = vectors[0].length
  const mean = new Array(dim).fill(0)
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) mean[i] += v[i]
  }
  return mean.map((x) => x / vectors.length)
}
