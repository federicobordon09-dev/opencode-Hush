import { describe, expect, it } from "vitest"

import {
  SUBAGENT_ROW_CAP,
  ellipsize,
  normalizeTitle,
  subagentDescription,
  subagentDurationMs,
  subagentName,
  subagentState,
  subagentsView,
  type SubagentSnapshot,
} from "../src/core/subagents.ts"

const snapshot = (values: Partial<SubagentSnapshot> = {}): SubagentSnapshot => ({
  id: values.id ?? "s1",
  status: values.status ?? "idle",
  agent: values.agent,
  agentName: values.agentName,
  model: values.model,
  title: values.title,
  outcome: values.outcome,
  tokens: values.tokens,
  createdAt: values.createdAt,
  endedAt: values.endedAt,
})

describe("subagentState", () => {
  it("keeps a running session running even when an outcome lingers", () => {
    expect(subagentState(snapshot({ status: "running", outcome: "succeeded" }))).toBe("running")
    expect(subagentState(snapshot({ status: "running" }))).toBe("running")
  })

  it("maps the terminal outcomes", () => {
    expect(subagentState(snapshot({ outcome: "succeeded" }))).toBe("done")
    expect(subagentState(snapshot({ outcome: "failed" }))).toBe("error")
  })

  it("reads interrupted and idle-without-outcome as stopped, not done", () => {
    expect(subagentState(snapshot({ outcome: "interrupted" }))).toBe("stopped")
    expect(subagentState(snapshot({ status: "idle" }))).toBe("stopped")
  })
})

describe("subagentName", () => {
  it("prefers the catalog display name over the raw agent id", () => {
    expect(subagentName(snapshot({ agentName: "Analyzer", agent: "analyze" }))).toBe("Analyzer")
  })

  it("falls back to the raw agent id and then the task title", () => {
    expect(subagentName(snapshot({ agent: "analyze", title: "Review the module" }))).toBe("analyze")
    expect(subagentName(snapshot({ title: "Review the module" }))).toBe("Review the module")
  })

  it("comes back empty when the host gave nothing", () => {
    expect(subagentName(snapshot())).toBe("")
    expect(subagentName(snapshot({ agent: "  " }))).toBe("")
  })
})

describe("subagentDescription", () => {
  it("normalizes whitespace runs in the task text", () => {
    const snap = snapshot({ title: "  Review   the\nmodule\ttoday " })
    expect(subagentDescription(snap, "analyze")).toBe("Review the module today")
    expect(normalizeTitle("a\n\n b")).toBe("a b")
  })

  it("stays undefined when the title just repeats the name", () => {
    const snap = snapshot({ title: "Analyze" })
    expect(subagentDescription(snap, "analyze")).toBeUndefined()
    expect(subagentDescription(snapshot({ title: "Analyze this" }), "analyze")).toBe("Analyze this")
  })

  it("stays undefined without a title", () => {
    expect(subagentDescription(snapshot(), "analyze")).toBeUndefined()
  })
})

describe("ellipsize", () => {
  it("leaves text that fits untouched", () => {
    expect(ellipsize("short", 34)).toBe("short")
    expect(ellipsize("exact", 5)).toBe("exact")
  })

  it("cuts with an ellipsis inside the width", () => {
    const cut = ellipsize("Reviewing the module of servers", 10)
    expect(cut).toBe("Reviewing…")
    expect(Array.from(cut).length).toBe(10)
  })

  it("degrades on impossible widths", () => {
    expect(ellipsize("text", 1)).toBe("…")
    expect(ellipsize("text", 0)).toBe("")
  })
})

describe("subagentDurationMs", () => {
  it("ticks with the clock while running", () => {
    const row = { ...subagentsView([snapshot({ status: "running", createdAt: 1_000 })]).rows[0] }
    expect(subagentDurationMs(row, 4_000)).toBe(3_000)
    expect(subagentDurationMs(row, 9_000)).toBe(8_000)
  })

  it("freezes at the end time once finished, whatever the clock says", () => {
    const view = subagentsView([snapshot({ outcome: "succeeded", createdAt: 1_000, endedAt: 7_500 })])
    const row = { ...view.rows[0] }
    expect(subagentDurationMs(row, 9_000)).toBe(6_500)
    expect(subagentDurationMs(row, 90_000)).toBe(6_500)
  })

  it("refuses to invent a duration from missing timestamps", () => {
    const noStart = { ...subagentsView([snapshot({ createdAt: 0 })]).rows[0] }
    const noEnd = { ...subagentsView([snapshot({ createdAt: 1_000 })]).rows[0] }
    expect(subagentDurationMs(noStart, 5_000)).toBeUndefined()
    expect(subagentDurationMs(noEnd, 5_000)).toBeUndefined()
  })

  it("never reports a negative duration", () => {
    const row = { ...subagentsView([snapshot({ outcome: "failed", createdAt: 5_000, endedAt: 1_000 })]).rows[0] }
    expect(subagentDurationMs(row, 9_000)).toBe(0)
  })
})

describe("subagentsView", () => {
  it("reports an empty view with zeroed counters", () => {
    expect(subagentsView([])).toEqual({
      rows: [],
      summary: { total: 0, running: 0, done: 0, error: 0, stopped: 0, overflow: 0 },
    })
  })

  it("orders running first, then by most recent start", () => {
    const view = subagentsView([
      snapshot({ id: "old-done", outcome: "succeeded", createdAt: 1_000 }),
      snapshot({ id: "running", status: "running", createdAt: 500 }),
      snapshot({ id: "new-done", outcome: "failed", createdAt: 3_000 }),
    ])
    expect(view.rows.map((row) => row.id)).toEqual(["running", "new-done", "old-done"])
  })

  it("caps the rows and counts the rest as overflow", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      snapshot({ id: `s${index}`, outcome: "succeeded", createdAt: index }),
    )
    const view = subagentsView(many)
    expect(view.rows.length).toBe(SUBAGENT_ROW_CAP)
    expect(view.summary.total).toBe(9)
    expect(view.summary.overflow).toBe(3)
  })

  it("counts every state across all rows, visible or not", () => {
    const many = [
      ...Array.from({ length: 7 }, (_, index) =>
        snapshot({ id: `d${index}`, outcome: "succeeded" as const, createdAt: index }),
      ),
      snapshot({ id: "r1", status: "running", createdAt: 100 }),
      snapshot({ id: "e1", outcome: "failed" as const, createdAt: 90 }),
      snapshot({ id: "x1", outcome: "interrupted" as const, createdAt: 80 }),
    ]
    const view = subagentsView(many)
    expect(view.summary).toEqual({ total: 10, running: 1, done: 7, error: 1, stopped: 1, overflow: 4 })
    // Running first, then the ended ones by recency of start.
    expect(view.rows[0]?.id).toBe("r1")
    expect(view.rows[0]?.state).toBe("running")
    expect(view.rows[1]?.state).toBe("error")
  })

  it("hides zero tokens and passes real ones through", () => {
    const view = subagentsView([snapshot({ tokens: 0, id: "a" }), snapshot({ tokens: 4_200, id: "b" })])
    expect(view.rows.find((row) => row.id === "a")?.tokens).toBeUndefined()
    expect(view.rows.find((row) => row.id === "b")?.tokens).toBe(4_200)
  })

  it("keeps the description only when it differs from the name", () => {
    const view = subagentsView([
      snapshot({ agent: "analyze", title: "Reviewing the module of servers" }),
      snapshot({ agent: "analyze", title: "analyze" }),
    ])
    expect(view.rows[0]?.description).toBe("Reviewing the module of servers")
    expect(view.rows[1]?.description).toBeUndefined()
  })
})
