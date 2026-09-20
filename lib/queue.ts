// Runs async tasks one after another. Read-modify-write on a single storage
// key must not interleave: two quick calls would both read the old value and
// the second write would erase the first (see rule 9 in CONTRIBUTING.md). A failed
// task does not block the ones behind it.
//
// This only orders work inside one JS context. The popup and the background
// worker are separate contexts, so anything both write must also re-read right
// before saving (see lib/updates.ts).
export function createQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}
