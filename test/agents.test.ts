import { describe, expect, it } from "vitest"

import { deriveAgentRows, summarizeAgents, type AgentSessionView } from "../src/core/agents.ts"
import type { TokenUsageView } from "../src/core/usage.ts"

const tokens = (total: number): TokenUsageView => ({
  input: total,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
})

const session = (values: Partial<AgentSessionView> & { id: string }): AgentSessionView => ({
  cost: 0,
  tokens: tokens(0),
  ...values,
})

const idle = () => "idle" as const
const running = () => "running" as const

describe("deriveAgentRows", () => {
  it("renders nothing for a session without children", () => {
    const rows = deriveAgentRows({
      sessions: [session({ id: "root" })],
      rootID: "root",
      family: ["root"],
      statusOf: idle,
    })
    expect(rows).toEqual([])
  })

  it("lists children from the family and never the root", () => {
    const rows = deriveAgentRows({
      sessions: [session({ id: "root" }), session({ id: "child", parentID: "root" })],
      rootID: "root",
      family: ["root", "child"],
      statusOf: idle,
    })
    expect(rows.map((row) => row.id)).toEqual(["child"])
  })

  it("counts a child once even when the family and parent chain both name it", () => {
    const rows = deriveAgentRows({
      sessions: [
        session({ id: "root" }),
        session({ id: "child", parentID: "root" }),
        session({ id: "grandchild", parentID: "child" }),
      ],
      rootID: "root",
      family: ["root", "child", "grandchild", "grandchild"],
      statusOf: idle,
    })
    expect(rows.map((row) => row.id).sort()).toEqual(["child", "grandchild"])
  })

  it("picks up a child the family list has not caught up with yet", () => {
    const rows = deriveAgentRows({
      sessions: [session({ id: "root" }), session({ id: "late", parentID: "root" })],
      rootID: "root",
      family: ["root"],
      statusOf: idle,
    })
    expect(rows.map((row) => row.id)).toEqual(["late"])
  })

  it("ignores sessions from other trees", () => {
    const rows = deriveAgentRows({
      sessions: [
        session({ id: "root" }),
        session({ id: "child", parentID: "root" }),
        session({ id: "other", parentID: "elsewhere" }),
        session({ id: "orphan" }),
      ],
      rootID: "root",
      family: ["root"],
      statusOf: idle,
    })
    expect(rows.map((row) => row.id)).toEqual(["child"])
  })

  it("prefers the title, then the agent, then a short id", () => {
    const rows = deriveAgentRows({
      sessions: [
        session({ id: "root" }),
        session({ id: "a", parentID: "root", title: "  Explore the repo  " }),
        session({ id: "b", parentID: "root", agent: "build" }),
        session({ id: "0199f3ab7c", parentID: "root" }),
      ],
      rootID: "root",
      family: ["root"],
      statusOf: idle,
    })
    const labels = Object.fromEntries(rows.map((row) => [row.id, row.label]))
    expect(labels["a"]).toBe("Explore the repo")
    expect(labels["b"]).toBe("build")
    expect(labels["0199f3ab7c"]).toBe("0199f3a")
  })

  it("reads state from the host status and outcome from the session", () => {
    const rows = deriveAgentRows({
      sessions: [
        session({ id: "root" }),
        session({ id: "active", parentID: "root" }),
        session({ id: "ok", parentID: "root", outcome: "succeeded", cost: 0.42, tokens: tokens(1_500) }),
        session({ id: "bad", parentID: "root", outcome: "failed" }),
      ],
      rootID: "root",
      family: ["root", "active", "ok", "bad"],
      statusOf: (id) => (id === "active" ? "running" : "idle"),
    })

    const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
    expect(byId["active"].state).toBe("running")
    expect(byId["ok"]).toMatchObject({ state: "idle", outcome: "succeeded", cost: 0.42, tokens: 1_500 })
    expect(byId["bad"]).toMatchObject({ state: "idle", outcome: "failed" })
  })

  it("survives missing or invalid session numbers", () => {
    const rows = deriveAgentRows({
      sessions: [
        session({ id: "root" }),
        session({ id: "odd", parentID: "root", cost: Number.NaN, tokens: tokens(Number.NaN) }),
      ],
      rootID: "root",
      family: ["root"],
      statusOf: idle,
    })
    expect(rows[0]).toMatchObject({ cost: 0, tokens: 0 })
  })

  it("puts running agents first and is stable across repeated derivation", () => {
    const input = {
      sessions: [
        session({ id: "root" }),
        session({ id: "old", parentID: "root", time: { updated: 100 } }),
        session({ id: "new", parentID: "root", time: { updated: 900 } }),
        session({ id: "live", parentID: "root", time: { updated: 50 } }),
      ],
      rootID: "root",
      family: ["root", "old", "new", "live"],
      statusOf: (id: string) => (id === "live" ? running() : idle()),
    }
    const first = deriveAgentRows(input).map((row) => row.id)
    const second = deriveAgentRows(input).map((row) => row.id)
    expect(first).toEqual(["live", "new", "old"])
    expect(second).toEqual(first)
  })
})

describe("summarizeAgents", () => {
  it("counts active, done and failed without overlap", () => {
    const rows = deriveAgentRows({
      sessions: [
        session({ id: "root" }),
        session({ id: "a", parentID: "root" }),
        session({ id: "b", parentID: "root", outcome: "succeeded" }),
        session({ id: "c", parentID: "root", outcome: "failed" }),
        session({ id: "d", parentID: "root", outcome: "interrupted" }),
      ],
      rootID: "root",
      family: ["root", "a", "b", "c", "d"],
      statusOf: (id) => (id === "a" ? "running" : "idle"),
    })
    expect(summarizeAgents(rows)).toEqual({ total: 4, active: 1, done: 1, failed: 1, interrupted: 1 })
  })

  it("reports an empty summary for no rows", () => {
    expect(summarizeAgents([])).toEqual({ total: 0, active: 0, done: 0, failed: 0, interrupted: 0 })
  })
})
