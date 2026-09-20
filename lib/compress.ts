// Native gzip (CompressionStream), no dependency. Result JSON is highly
// repetitive text, so it shrinks ~4x — which is what keeps the cache small.
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function fromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function compressJson(value: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"))
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()))
}

export async function decompressJson<T>(encoded: string): Promise<T> {
  const stream = new Blob([fromBase64(encoded)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
  return JSON.parse(await new Response(stream).text()) as T
}
