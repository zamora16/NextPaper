import { useRef, useState } from "react"

export type CopyPhase = "idle" | "busy" | "ready" | "copied"

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Building a citation may involve network calls (Crossref), and browsers can
// reject clipboard writes when too much time passed since the click. So the
// action has phases: "busy" while preparing, "copied" on success, and "ready"
// as a fallback — the text is prepared and the next click copies it instantly
// (still inside a fresh user gesture).
export function useCopyAction(
  getText: (
    onProgress: (done: number, total: number) => void
  ) => Promise<string>
) {
  const [phase, setPhase] = useState<CopyPhase>("idle")
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const prepared = useRef("")

  const finish = async () => {
    if (await tryCopy(prepared.current)) {
      setPhase("copied")
      setTimeout(() => setPhase("idle"), 1500)
    } else {
      setPhase("ready")
    }
  }

  const run = async () => {
    if (phase === "busy") return
    if (phase === "ready") return finish()

    setPhase("busy")
    setProgress(null)
    try {
      prepared.current = await getText((done, total) =>
        setProgress([done, total])
      )
    } catch {
      setPhase("idle")
      return
    }
    await finish()
  }

  const label = (idle: string) => {
    if (phase === "busy") {
      return progress && progress[1] > 1
        ? `Preparando ${progress[0]}/${progress[1]}`
        : "Preparando..."
    }
    if (phase === "ready") return "Pulsa para copiar"
    if (phase === "copied") return "Copiado"
    return idle
  }

  return { phase, run, label }
}
