import { useEffect, useState } from "react"

// A value kept in chrome.storage.local that the popup mirrors: read it once,
// and read it again whenever that key changes (the background worker writes
// alerts and job states while the popup is open).
export function useStorageValue<T>(
  key: string,
  read: () => Promise<T>,
  initial: T
): T {
  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    let live = true
    const refresh = () =>
      read().then((next) => {
        if (live) setValue(next)
      })

    refresh()
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes[key]) refresh()
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      live = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [key])

  return value
}
