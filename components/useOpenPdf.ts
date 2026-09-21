import { useEffect, useState } from "react"

import { findOpenCopy, peekOpenCopy, type OpenCopy } from "~lib/unpaywall"

export type PdfPhase = "idle" | "busy" | "found" | "none" | "error"

// The "Find PDF" button of a card: asks Unpaywall for a free copy when the user
// clicks, and remembers the answer. `doi` is undefined when there is nothing to
// ask about (no DOI, or the paper already has a PDF), which keeps it idle.
export function useOpenPdf(doi: string | undefined) {
  const [state, setState] = useState<{ phase: PdfPhase; copy?: OpenCopy }>({
    phase: "idle"
  })

  const apply = (answer: OpenCopy | null | undefined) =>
    setState(
      answer
        ? { phase: "found", copy: answer }
        : { phase: answer === null ? "none" : "error" }
    )

  // An earlier answer shows at once, with no request.
  useEffect(() => {
    if (!doi) return
    let live = true
    peekOpenCopy(doi)
      .then((answer) => {
        if (live && answer !== undefined) apply(answer)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [doi])

  const find = async () => {
    if (!doi || state.phase === "busy") return
    setState({ phase: "busy" })
    apply(await findOpenCopy(doi))
  }

  return { ...state, find }
}
