import { describe, expect, it } from "vitest"

import { createQueue } from "~lib/queue"

describe("createQueue", () => {
  it("runs tasks one at a time, in the order they were added", async () => {
    const run = createQueue()
    const log: string[] = []
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`)
      await new Promise((r) => setTimeout(r, ms))
      log.push(`end ${name}`)
      return name
    }
    const results = await Promise.all([
      run(task("a", 20)),
      run(task("b", 1)),
      run(task("c", 5))
    ])
    expect(results).toEqual(["a", "b", "c"])
    expect(log).toEqual([
      "start a",
      "end a",
      "start b",
      "end b",
      "start c",
      "end c"
    ])
  })

  it("passes each task's own result or error to its caller", async () => {
    const run = createQueue()
    await expect(run(async () => 42)).resolves.toBe(42)
    await expect(
      run(async () => {
        throw new Error("nope")
      })
    ).rejects.toThrow("nope")
  })

  it("keeps going after a task fails", async () => {
    const run = createQueue()
    const failing = run(async () => {
      throw new Error("x")
    })
    const after = run(async () => "still runs")
    await expect(failing).rejects.toThrow()
    await expect(after).resolves.toBe("still runs")
  })

  it("two independent queues do not wait for each other", async () => {
    const one = createQueue()
    const two = createQueue()
    const order: string[] = []
    const slow = one(async () => {
      await new Promise((r) => setTimeout(r, 20))
      order.push("slow")
    })
    const quick = two(async () => order.push("quick"))
    await Promise.all([slow, quick])
    expect(order).toEqual(["quick", "slow"])
  })
})
