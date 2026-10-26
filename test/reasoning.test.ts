import { describe, expect, it } from "vitest"
import { createReasoningTracker, type ReasoningEvent } from "../src/core/reasoning.ts"

const event = (type: string, sessionID = "s1", created = 1): ReasoningEvent => ({ type, created, data: { sessionID } })

describe("reasoning event state", () => {
  it("tracks started, delta, and ended events per session", () => {
    const tracker = createReasoningTracker()
    tracker.apply(event("session.reasoning.started"))
    expect(tracker.isActive("s1")).toBe(true)
    tracker.apply(event("session.reasoning.ended", "s1", 2))
    expect(tracker.isActive("s1")).toBe(false)
    tracker.apply(event("session.reasoning.delta", "s2", 3))
    expect(tracker.isActive("s1")).toBe(false)
    expect(tracker.isActive("s2")).toBe(true)
  })

  it("ignores an older terminal event", () => {
    const tracker = createReasoningTracker()
    tracker.apply(event("session.reasoning.started", "s1", 10))
    tracker.apply(event("session.reasoning.ended", "s1", 9))
    expect(tracker.isActive("s1")).toBe(true)
  })

  it("clears terminal and deleted sessions without affecting another session", () => {
    const tracker = createReasoningTracker()
    tracker.apply(event("session.reasoning.started", "s1", 1))
    tracker.apply(event("session.reasoning.started", "s2", 1))
    tracker.apply(event("session.idle", "s1", 2))
    tracker.apply(event("session.deleted", "s2", 2))
    expect(tracker.isActive("s1")).toBe(false)
    expect(tracker.isActive("s2")).toBe(false)
  })
})
