import { describe, expect, it } from "vitest"

import { formatPercent, formatTokens } from "../src/core/format.ts"

describe("formatTokens", () => {
  it("renders small counts as-is", () => {
    expect(formatTokens(0)).toBe("0")
    expect(formatTokens(840)).toBe("840")
  })

  it("renders thousands with one decimal", () => {
    expect(formatTokens(1_000)).toBe("1.0K")
    expect(formatTokens(71_400)).toBe("71.4K")
  })

  it("renders millions with one decimal", () => {
    expect(formatTokens(1_200_000)).toBe("1.2M")
  })

  it("treats invalid input as zero", () => {
    expect(formatTokens(Number.NaN)).toBe("0")
    expect(formatTokens(-5)).toBe("0")
  })
})

describe("formatPercent", () => {
  it("rounds to a whole percentage", () => {
    expect(formatPercent(0.36)).toBe("36%")
    expect(formatPercent(0.999)).toBe("100%")
  })

  it("clamps out-of-range ratios", () => {
    expect(formatPercent(-1)).toBe("0%")
    expect(formatPercent(2)).toBe("100%")
  })

  it("treats invalid input as zero", () => {
    expect(formatPercent(Number.NaN)).toBe("0%")
  })
})
