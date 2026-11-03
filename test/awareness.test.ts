import { describe, expect, it } from "vitest"

import {
  activeTools,
  createExecutionErrorTracker,
  formatActiveTools,
  recentExecutionError,
  type AwarenessMessage,
  type ExecutionEvent,
} from "../src/core/awareness.ts"

const assistant = (...content: unknown[]): AwarenessMessage => ({ type: "assistant", content })
const tool = (name: string, status: string, created?: number) => ({
  type: "tool",
  name,
  time: created === undefined ? undefined : { created },
  state: { status },
})

describe("active tool awareness", () => {
  it("counts only tool parts the host marks running", () => {
    expect(activeTools([
      assistant(tool("bash", "running", 1), tool("read", "completed", 2), tool("grep", "error", 3)),
      assistant(tool("bash", "running", 4)),
    ])).toEqual([{ name: "bash", count: 2, createdAt: 4 }])
  })

  it("ignores malformed, unnamed, and non-assistant parts", () => {
    expect(activeTools([
      { type: "user", content: [tool("bash", "running")] },
      assistant(tool(" ", "running"), { type: "tool", name: "grep" }, null),
    ])).toEqual([])
  })

  it("formats multiple active tool names compactly", () => {
    const tools = activeTools([assistant(tool("bash", "running", 1), tool("read", "running", 2), tool("grep", "running", 3))])
    expect(formatActiveTools(tools)).toBe("grep, read +1")
    expect(formatActiveTools([])).toBeUndefined()
  })
})

describe("recent execution error", () => {
  it("restores the latest failed terminal outcome with only the host message", () => {
    expect(recentExecutionError([
      { type: "idle", outcome: "succeeded" },
      { type: "idle", outcome: "failed", error: { message: "  provider   failed  " }, time: { created: 20 } },
    ])).toEqual({ message: "provider failed", createdAt: 20 })
  })

  it("clears a previous failure after a later terminal success or new user input", () => {
    const failure = { type: "idle", outcome: "failed", error: { message: "failed" } }
    expect(recentExecutionError([failure, { type: "idle", outcome: "succeeded" }])).toBeUndefined()
    expect(recentExecutionError([failure, { type: "user" }])).toBeUndefined()
  })

  it("does not invent an error description when the host omits one", () => {
    expect(recentExecutionError([{ type: "idle", outcome: "failed" }])).toEqual({ message: undefined, createdAt: undefined })
  })
})

describe("execution error event lifecycle", () => {
  const event = (type: string, sessionID = "s1", created = 10, error?: unknown): ExecutionEvent => ({
    type,
    created,
    data: { sessionID, error },
  })

  it("keeps the session's run state separate and clears errors on the next run or successful completion", () => {
    const tracker = createExecutionErrorTracker()
    tracker.activate("s1")
    tracker.apply(event("session.execution.failed", "s1", 10, { message: "tool failed" }), "s1")
    expect(tracker.current("s1")).toEqual({ message: "tool failed", createdAt: 10 })
    tracker.apply(event("session.execution.started", "s1", 11), "s1")
    expect(tracker.current("s1")).toBeUndefined()
    tracker.apply(event("session.execution.failed", "s1", 12), "s1")
    tracker.apply(event("session.execution.succeeded", "s1", 13), "s1")
    expect(tracker.current("s1")).toBeUndefined()
  })

  it("hydrates once and does not overwrite a newer event received during hydration", () => {
    const tracker = createExecutionErrorTracker()
    tracker.activate("s1")
    tracker.apply(event("session.execution.started", "s1", 30), "s1")
    tracker.hydrate("s1", { message: "old error", createdAt: 20 })
    expect(tracker.current("s1")).toBeUndefined()
  })

  it("ignores stale events from other sessions and out-of-order events", () => {
    const tracker = createExecutionErrorTracker()
    tracker.activate("s2")
    tracker.apply(event("session.execution.failed", "s1", 40, { message: "wrong session" }), "s2")
    tracker.apply(event("session.execution.failed", "s2", 20, { message: "current" }), "s2")
    tracker.apply(event("session.execution.started", "s2", 19), "s2")
    expect(tracker.current("s2")).toEqual({ message: "current", createdAt: 20 })
  })

  it("resets on session switching and cannot expose the previous session's error", () => {
    const tracker = createExecutionErrorTracker()
    tracker.activate("s1")
    tracker.apply(event("session.execution.failed", "s1", 10, { message: "old" }), "s1")
    tracker.activate("s2")
    expect(tracker.current("s2")).toBeUndefined()
    tracker.hydrate("s2", undefined)
    expect(tracker.current("s1")).toBeUndefined()
  })
})
