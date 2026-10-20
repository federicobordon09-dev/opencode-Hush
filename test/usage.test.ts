import { describe, expect, it } from "vitest"

import {
  contextMessage,
  contextPressure,
  contextUsage,
  processedTokens,
  sumTokenTotals,
  totalTokens,
  type ConversationMessage,
  type TokenUsageView,
} from "../src/core/usage.ts"

const usage = (
  values: Partial<Omit<TokenUsageView, "cache">> & { cache?: Partial<TokenUsageView["cache"]> } = {},
): TokenUsageView => ({
  input: values.input ?? 0,
  output: values.output ?? 0,
  reasoning: values.reasoning ?? 0,
  cache: { read: values.cache?.read ?? 0, write: values.cache?.write ?? 0 },
})

const user = (id: string): ConversationMessage => ({ id, type: "user" })
const assistant = (id: string, tokens?: TokenUsageView): ConversationMessage => ({ id, type: "assistant", tokens })
const compaction = (id: string, status: string): ConversationMessage => ({ id, type: "compaction", status })

describe("totalTokens", () => {
  it("sums every counter the host reports", () => {
    expect(totalTokens(usage({ input: 100, output: 20, reasoning: 5, cache: { read: 1_000, write: 200 } }))).toBe(1_325)
  })

  it("returns zero for an empty record", () => {
    expect(totalTokens(usage())).toBe(0)
  })
})

describe("processedTokens", () => {
  it("counts input, output, reasoning and cache writes", () => {
    expect(processedTokens(usage({ input: 100, output: 20, reasoning: 5, cache: { read: 1_000, write: 200 } }))).toBe(325)
  })

  it("leaves the cached reads out", () => {
    expect(processedTokens(usage({ cache: { read: 5_000 } }))).toBe(0)
    expect(processedTokens(usage({ input: 10, cache: { read: 5_000 } }))).toBe(10)
  })

  it("treats a counter the host never filled in as zero", () => {
    expect(processedTokens(usage({ input: Number.NaN, output: Number.POSITIVE_INFINITY }))).toBe(0)
    expect(processedTokens(usage({ input: Number.NaN, output: 7 }))).toBe(7)
  })
})

describe("sumTokenTotals", () => {
  it("splits processed tokens from cached reads across a family", () => {
    const root = usage({ input: 3_000, output: 900, reasoning: 100, cache: { read: 50_000, write: 0 } })
    const child = usage({ input: 200, output: 40, reasoning: 10, cache: { read: 2_000, write: 5 } })
    expect(sumTokenTotals([root, child])).toEqual({ tokens: 4_255, cached: 52_000 })
  })

  it("reports zero for a family with no sessions", () => {
    expect(sumTokenTotals([])).toEqual({ tokens: 0, cached: 0 })
  })

  it("keeps the cached reads out of the processed total", () => {
    const totals = sumTokenTotals([usage({ input: 10, cache: { read: 900 } })])
    expect(totals.tokens).toBe(10)
    expect(totals.cached).toBe(900)
  })

  it("ignores counters the host never filled in", () => {
    const totals = sumTokenTotals([usage({ input: Number.NaN, cache: { read: Number.NaN } }), usage({ output: 5 })])
    expect(totals).toEqual({ tokens: 5, cached: 0 })
  })
})

describe("contextMessage", () => {
  it("picks the newest assistant message carrying usage", () => {
    const messages = [user("u1"), assistant("a1", usage({ input: 10 })), assistant("a2", usage({ input: 20 }))]
    expect(contextMessage(messages)?.id).toBe("a2")
  })

  it("skips assistant messages without usage", () => {
    const messages = [assistant("a1", usage({ input: 10 })), assistant("a2")]
    expect(contextMessage(messages)?.id).toBe("a1")
  })

  it("ignores usage from before the last completed compaction", () => {
    const messages = [assistant("a1", usage({ input: 10 })), compaction("c1", "completed"), user("u1")]
    expect(contextMessage(messages)).toBeUndefined()
  })

  it("keeps usage that arrived after a completed compaction", () => {
    const messages = [assistant("a1", usage({ input: 10 })), compaction("c1", "completed"), assistant("a2", usage({ input: 4 }))]
    expect(contextMessage(messages)?.id).toBe("a2")
  })

  it("ignores compactions that have not completed", () => {
    const messages = [assistant("a1", usage({ input: 10 })), compaction("c1", "running")]
    expect(contextMessage(messages)?.id).toBe("a1")
  })

  it("stops at the revert boundary", () => {
    const messages = [assistant("a1", usage({ input: 10 })), assistant("a2", usage({ input: 20 }))]
    expect(contextMessage(messages, "a1")?.id).toBeUndefined()
    expect(contextMessage(messages, "a2")?.id).toBe("a1")
  })

  it("reports nothing when the boundary is unknown", () => {
    expect(contextMessage([assistant("a1", usage({ input: 10 }))], "missing")).toBeUndefined()
  })

  it("handles an empty session", () => {
    expect(contextMessage([])).toBeUndefined()
  })
})

describe("contextUsage", () => {
  it("reports used, limit and ratio when both sides are known", () => {
    const record = assistant("a1", usage({ input: 71_000, output: 400 }))
    expect(contextUsage(record, 200_000)).toEqual({ used: 71_400, limit: 200_000, ratio: 71_400 / 200_000 })
  })

  it("reports tokens without a ratio when the limit is unknown", () => {
    const record = assistant("a1", usage({ input: 71_000 }))
    expect(contextUsage(record, undefined)).toEqual({ used: 71_000 })
  })

  it("rejects limits that cannot form a ratio", () => {
    const record = assistant("a1", usage({ input: 500 }))
    expect(contextUsage(record, 0)).toEqual({ used: 500 })
    expect(contextUsage(record, Number.NaN)).toEqual({ used: 500 })
    expect(contextUsage(record, -1)).toEqual({ used: 500 })
  })

  it("reports nothing without a usable measurement", () => {
    expect(contextUsage(undefined, 200_000)).toBeUndefined()
    expect(contextUsage(assistant("a1"), 200_000)).toBeUndefined()
    expect(contextUsage(assistant("a1", usage()), 200_000)).toBeUndefined()
    expect(contextUsage(assistant("a1", usage({ input: Number.NaN })), 200_000)).toBeUndefined()
  })
})

describe("contextPressure", () => {
  it("stays calm below the warning threshold", () => {
    expect(contextPressure(0)).toBe("calm")
    expect(contextPressure(0.699)).toBe("calm")
  })

  it("warns from 70% and escalates at 90%", () => {
    expect(contextPressure(0.7)).toBe("warn")
    expect(contextPressure(0.899)).toBe("warn")
    expect(contextPressure(0.9)).toBe("critical")
    expect(contextPressure(1)).toBe("critical")
  })

  it("never invents pressure without a ratio", () => {
    expect(contextPressure(undefined)).toBe("calm")
    expect(contextPressure(Number.NaN)).toBe("calm")
  })
})
