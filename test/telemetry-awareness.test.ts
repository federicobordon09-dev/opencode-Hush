import { createRoot, createSignal } from "solid-js"
import { describe, expect, it, vi } from "vitest"

import { createSessionAwareness } from "../src/telemetry.ts"
import { formatActiveTools } from "../src/core/awareness.ts"

type EventHandler = (event: any) => void

function awarenessHarness(initialSessionID = "s1", failedSyncs: string[] = []) {
  const handlers = new Map<string, Set<EventHandler>>()
  const [selectedSession, setSelectedSession] = createSignal<string | undefined>(initialSessionID)
  const [status, setStatus] = createSignal<"running" | "idle">("idle")
  const [messages, setMessages] = createSignal<any[]>([])
  const [permissions, setPermissions] = createSignal<any[]>([])
  const [forms, setForms] = createSignal<any[]>([])
  const stopCounts = new Map<string, number>()
  const permissionSync = vi.fn(async () => {
    if (failedSyncs.includes("permission")) throw new Error("unavailable")
  })
  const formSync = vi.fn(async () => {
    if (failedSyncs.includes("form")) throw new Error("unavailable")
  })
  const sessionSync = vi.fn(async () => {})
  const messageSync = vi.fn(async () => {})

  const data = {
    on(type: string, handler: EventHandler) {
      const listeners = handlers.get(type) ?? new Set<EventHandler>()
      listeners.add(handler)
      handlers.set(type, listeners)
      return () => {
        listeners.delete(handler)
        stopCounts.set(type, (stopCounts.get(type) ?? 0) + 1)
      }
    },
    location: { default: () => ({ directory: "/project" }) },
    session: {
      sync: sessionSync,
      get: () => ({ location: { directory: "/project" } }),
      status: () => status(),
      message: { sync: messageSync, list: () => messages() },
      permission: { sync: permissionSync, list: () => permissions() },
      form: { sync: formSync, list: () => forms() },
    },
  }
  const context = { data } as unknown as Parameters<typeof createSessionAwareness>[0]
  const awareness = createRoot((dispose) => ({
    dispose,
    value: createSessionAwareness(context, selectedSession),
  }))

  const emit = (type: string, sessionID: string, created = 1, error?: unknown) => {
    for (const handler of handlers.get(type) ?? []) handler({ type, created, data: { sessionID, error } })
  }
  const flush = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  return {
    ...awareness,
    selectedSession,
    setSelectedSession,
    setStatus,
    setMessages,
    setPermissions,
    setForms,
    stopCounts,
    sessionSync,
    messageSync,
    permissionSync,
    formSync,
    emit,
    flush,
  }
}

describe("session awareness hydration", () => {
  it("hydrates status and pending collections on mount", async () => {
    const harness = awarenessHarness()
    harness.setStatus("running")
    harness.setPermissions([{ id: "p1" }, { id: "p2" }])
    harness.setForms([{ id: "f1" }])
    harness.setMessages([{ type: "idle", outcome: "failed", error: { message: "compile failed" }, time: { created: 10 } }])

    await harness.flush()

    expect(harness.sessionSync).toHaveBeenCalledWith("s1")
    expect(harness.messageSync).toHaveBeenCalledWith("s1")
    expect(harness.value.status()).toBe("running")
    expect(harness.value.permissions()).toBe(2)
    expect(harness.value.forms()).toBe(1)
    // A live execution supersedes an older failed idle record.
    expect(harness.value.error()).toBeUndefined()
    harness.dispose()
  })

  it("hydrates a recent failure for an idle session without inventing its description", async () => {
    const harness = awarenessHarness()
    harness.setMessages([{ type: "idle", outcome: "failed", time: { created: 10 } }])
    await harness.flush()
    expect(harness.value.status()).toBe("idle")
    expect(harness.value.error()).toEqual({ message: undefined, createdAt: 10 })
    harness.dispose()
  })

  it("reconstructs only running tools from hydrated messages and drops them on completion", async () => {
    const harness = awarenessHarness()
    const runningTool = { type: "tool", name: "bash", state: { status: "running" } }
    const doneTool = { type: "tool", name: "read", state: { status: "completed" } }
    harness.setMessages([{ type: "assistant", content: [runningTool, doneTool] }])
    await harness.flush()
    expect(formatActiveTools(harness.value.activeTools())).toBe("bash")
    harness.setMessages([{ type: "assistant", content: [{ ...runningTool, state: { status: "completed" } }, doneTool] }])
    expect(harness.value.activeTools()).toEqual([])
    harness.dispose()
  })

  it("keeps pending collections unknown when their sync fails", async () => {
    const harness = awarenessHarness("s1", ["permission", "form"])
    await harness.flush()
    expect(harness.value.permissions()).toBeUndefined()
    expect(harness.value.forms()).toBeUndefined()
    harness.dispose()
  })

  it("reacts to host status and pending-list updates without polling", async () => {
    const harness = awarenessHarness()
    await harness.flush()
    expect(harness.value.status()).toBe("idle")
    harness.setStatus("running")
    harness.setPermissions([{ id: "p1" }])
    harness.setForms([{ id: "f1" }, { id: "f2" }])
    expect(harness.value.status()).toBe("running")
    expect(harness.value.permissions()).toBe(1)
    expect(harness.value.forms()).toBe(2)
    harness.dispose()
  })
})

describe("session awareness events and lifecycle", () => {
  it("sets a recent error, clears it on a new execution, and ignores another session", async () => {
    const harness = awarenessHarness()
    await harness.flush()
    harness.emit("session.execution.failed", "s1", 10, { message: "tool failed" })
    expect(harness.value.error()).toEqual({ message: "tool failed", createdAt: 10 })
    harness.emit("session.execution.failed", "other", 11, { message: "wrong session" })
    expect(harness.value.error()?.message).toBe("tool failed")
    harness.emit("session.execution.started", "s1", 12)
    expect(harness.value.error()).toBeUndefined()
    harness.dispose()
  })

  it("clears stale awareness on session switch and ignores late events from the previous session", async () => {
    const harness = awarenessHarness()
    await harness.flush()
    harness.emit("session.execution.failed", "s1", 10, { message: "old session" })
    expect(harness.value.error()?.message).toBe("old session")

    harness.setSelectedSession("s2")
    expect(harness.value.status()).toBeUndefined()
    expect(harness.value.error()).toBeUndefined()
    harness.emit("session.execution.failed", "s1", 11, { message: "stale" })
    await harness.flush()
    expect(harness.value.error()).toBeUndefined()
    harness.dispose()
  })

  it("unsubscribes from every event when the panel is disposed", async () => {
    const harness = awarenessHarness()
    await harness.flush()
    harness.dispose()
    for (const type of [
      "session.execution.started",
      "session.execution.succeeded",
      "session.execution.failed",
      "session.execution.interrupted",
    ]) expect(harness.stopCounts.get(type)).toBe(1)
  })
})
