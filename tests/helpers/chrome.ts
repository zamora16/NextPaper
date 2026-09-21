// An in-memory stand-in for the parts of chrome.* the extension uses, so the
// storage-bound modules (cache, library, alerts) can be unit-tested without a
// browser. Values are cloned on the way in and out, as the real API does.
export interface FakeChrome {
  data: Map<string, unknown>
  // Writes fail while the stored bytes would exceed this (simulates the quota).
  quotaBytes: number
  badge: { text: string }
  sets: number
  // Messages sent to the background worker with chrome.runtime.sendMessage.
  messages: unknown[]
  // Listeners registered with chrome.storage.onChanged.
  listeners: Set<Listener>
}

type Listener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  area: string
) => void

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)

const size = (data: Map<string, unknown>) =>
  [...data.entries()].reduce(
    (sum, [key, value]) => sum + key.length + JSON.stringify(value).length,
    0
  )

export function installChrome(): FakeChrome {
  const state: FakeChrome = {
    data: new Map(),
    quotaBytes: Infinity,
    badge: { text: "" },
    sets: 0,
    messages: [],
    listeners: new Set()
  }

  // Like the real API, change events are delivered after the write.
  const emit = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>
  ) => {
    for (const listener of [...state.listeners]) listener(changes, "local")
  }

  const local = {
    async get(keys?: string | string[] | null) {
      const wanted =
        keys == null ? [...state.data.keys()] : ([] as string[]).concat(keys)
      const result: Record<string, unknown> = {}
      for (const key of wanted) {
        if (state.data.has(key)) result[key] = clone(state.data.get(key))
      }
      return result
    },
    async set(items: Record<string, unknown>) {
      const next = new Map(state.data)
      const changes: Record<
        string,
        { oldValue?: unknown; newValue?: unknown }
      > = {}
      for (const [key, value] of Object.entries(items)) {
        changes[key] = {
          oldValue: clone(state.data.get(key)),
          newValue: clone(value)
        }
        next.set(key, clone(value))
      }
      if (size(next) > state.quotaBytes) {
        throw new Error("QUOTA_BYTES quota exceeded")
      }
      state.sets++
      state.data = next
      emit(changes)
    },
    async remove(keys: string | string[]) {
      const changes: Record<string, { oldValue?: unknown }> = {}
      for (const key of ([] as string[]).concat(keys)) {
        if (state.data.has(key))
          changes[key] = { oldValue: clone(state.data.get(key)) }
        state.data.delete(key)
      }
      emit(changes)
    }
  }

  ;(globalThis as any).chrome = {
    storage: {
      local,
      onChanged: {
        addListener: (listener: Listener) => state.listeners.add(listener),
        removeListener: (listener: Listener) => state.listeners.delete(listener)
      }
    },
    runtime: {
      getManifest: () => ({ version: "9.9.9" }),
      sendMessage: (message: unknown) => {
        state.messages.push(message)
        return Promise.resolve({ started: true })
      }
    },
    action: {
      setBadgeText: async ({ text }: { text: string }) => {
        state.badge.text = text
      },
      setBadgeBackgroundColor: async () => {}
    }
  }
  return state
}

export const uninstallChrome = () => {
  delete (globalThis as any).chrome
}
