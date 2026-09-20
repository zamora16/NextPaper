import { useState } from "react"

import { buttonClass, primaryButtonClass } from "~components/ui"
import {
  checkApiKey,
  finishSetup,
  maskKey,
  normalizeApiKey,
  removeApiKey,
  saveApiKey,
  type Settings
} from "~lib/settings"

export const KEY_FORM_URL =
  "https://www.semanticscholar.org/product/api#api-key-form"

type Message = { tone: "ok" | "warn" | "error"; text: string } | null

const toneClass = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  error: "text-red-600"
}

// First-run setup and the settings screen. Each person uses their own free
// Semantic Scholar key (see lib/settings.ts for why), so this screen has to
// make getting one easy to follow.
export function KeySetup({
  settings,
  firstRun,
  onClose
}: {
  settings: Settings
  firstRun: boolean
  onClose?: () => void
}) {
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const hasKey = settings.s2ApiKey !== null

  const save = async () => {
    const key = normalizeApiKey(input)
    if (!key) {
      setMessage({
        tone: "error",
        text: "Eso no parece una clave. Es un texto de unas 40 letras y números, sin espacios. Cópiala entera del correo de Semantic Scholar."
      })
      return
    }

    setBusy(true)
    setMessage(null)
    const result = await checkApiKey(key)
    if (result === "invalid") {
      setBusy(false)
      setMessage({
        tone: "error",
        text: "Semantic Scholar no acepta esa clave. Comprueba que la copiaste completa y sin espacios."
      })
      return
    }

    await saveApiKey(key)
    setBusy(false)
    setInput("")
    setMessage(
      result === "valid"
        ? { tone: "ok", text: "Clave guardada y comprobada ✓" }
        : {
            tone: "warn",
            text: "Clave guardada, pero ahora no he podido comprobarla (Semantic Scholar está ocupado). Si algo falla, revísala aquí."
          }
    )
  }

  const remove = async () => {
    await removeApiKey()
    setMessage({
      tone: "ok",
      text: "Clave quitada. NextPaper funcionará sin clave (más lento)."
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {firstRun ? (
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Bienvenido a NextPaper
          </h2>
          <p className="text-xs text-slate-500">
            Configuración inicial · solo la primera vez
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Ajustes</h2>
          {onClose && (
            <button onClick={onClose} className={buttonClass}>
              Cerrar
            </button>
          )}
        </div>
      )}

      {firstRun && (
        <p className="text-sm text-slate-700">
          NextPaper busca literatura relacionada con lo que lees usando{" "}
          <strong>Semantic Scholar</strong>, una base de datos científica
          abierta y gratuita. Para funcionar bien necesita{" "}
          <strong>tu propia clave de acceso</strong>, que es gratis.
        </p>
      )}

      {!firstRun && (
        <p className="text-sm text-slate-700">
          Clave de Semantic Scholar:{" "}
          {hasKey ? (
            <strong>guardada ({maskKey(settings.s2ApiKey as string)})</strong>
          ) : (
            <strong>sin clave (modo lento)</strong>
          )}
        </p>
      )}

      <div className="rounded-lg bg-violet-50/60 p-2 text-xs text-slate-600">
        <p className="mb-1 font-semibold text-violet-700">
          ¿Por qué una clave propia?
        </p>
        <ul className="ml-4 list-disc space-y-0.5">
          <li>
            <strong>Va más rápido.</strong> Sin clave, el primer análisis de un
            paper puede tardar unos 20 segundos en vez de unos 5, y falla más.
          </li>
          <li>
            <strong>Es privada.</strong> Se guarda solo en este navegador y solo
            se envía a Semantic Scholar.
          </li>
          <li>
            <strong>Es tuya.</strong> Cada persona usa la suya, así NextPaper no
            depende de un servidor ni de un límite compartido con otros.
          </li>
        </ul>
      </div>

      <ol className="flex flex-col gap-2.5 text-sm text-slate-700">
        <li className="flex gap-2">
          <span className="font-semibold text-violet-600">1.</span>
          <div className="flex flex-col items-start gap-1">
            <span>
              <strong>Pide tu clave gratis</strong> en la web de Semantic
              Scholar. Rellena el formulario y te la enviarán por{" "}
              <strong>correo electrónico</strong>.
            </span>
            <a
              href={KEY_FORM_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonClass}>
              Abrir el formulario de Semantic Scholar ↗
            </a>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-violet-600">2.</span>
          <span>
            <strong>Copia la clave</strong> del correo: es un texto largo de
            letras y números. No la compartas con nadie.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-violet-600">3.</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span>
              <strong>Pégala aquí</strong> y pulsa Guardar.
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && save()}
              placeholder="Pega aquí tu clave"
              autoComplete="off"
              spellCheck={false}
              aria-label="Clave de API de Semantic Scholar"
              className="min-w-0 rounded border border-slate-200 px-2 py-1 font-mono text-xs text-slate-700 placeholder:font-sans placeholder:text-slate-400"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={save}
                disabled={busy || input.trim() === ""}
                className={primaryButtonClass}>
                {busy
                  ? "Comprobando..."
                  : firstRun
                    ? "Guardar y empezar"
                    : "Guardar clave"}
              </button>
              {hasKey && !firstRun && (
                <button onClick={remove} className={buttonClass}>
                  Quitar clave
                </button>
              )}
            </div>
          </div>
        </li>
      </ol>

      {message && (
        <p role="status" className={`text-xs ${toneClass[message.tone]}`}>
          {message.text}
        </p>
      )}

      {firstRun && (
        <div className="flex flex-col items-start gap-1 border-t border-slate-100 pt-2">
          <p className="text-xs text-slate-500">
            ¿No quieres pedir una clave ahora? Puedes empezar sin ella y
            añadirla más tarde en Ajustes (⚙).
          </p>
          <button onClick={() => finishSetup()} className={buttonClass}>
            Continuar sin clave (más lento)
          </button>
        </div>
      )}

      {!firstRun && (
        <div className="flex flex-col gap-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <p>
            Datos de{" "}
            <a
              href="https://www.semanticscholar.org"
              target="_blank"
              rel="noreferrer"
              className="underline">
              Semantic Scholar
            </a>{" "}
            (Allen Institute for AI) y{" "}
            <a
              href="https://www.crossref.org"
              target="_blank"
              rel="noreferrer"
              className="underline">
              Crossref
            </a>
            .
          </p>
          <p>
            Tu biblioteca, notas y clave se guardan solo en este navegador.
            NextPaper no usa cuentas, servidores ni analítica.
          </p>
          <p>
            Software libre (licencia MIT) · versión{" "}
            {chrome.runtime.getManifest().version}
          </p>
        </div>
      )}
    </div>
  )
}
