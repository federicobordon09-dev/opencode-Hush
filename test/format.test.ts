import { describe, expect, it } from "vitest"

import { formatCost, formatDuration, formatPercent, formatRate, formatTokens } from "../src/core/format.ts"

describe("formatTokens", () => {
  it("renders small counts as-is", () => {
    expect(formatTokens(0)).toBe("0")
    expect(formatTokens(840)).toBe("840")
  })

  it("renders thousands with one decimal", () => {
    expect(formatTokens(1_000)).toBe("1K")
    expect(formatTokens(71_400)).toBe("71.4K")
    expect(formatTokens(200_000)).toBe("200K")
  })

  it("renders millions with one decimal", () => {
    expect(formatTokens(1_200_000)).toBe("1.2M")
    expect(formatTokens(1_000_000)).toBe("1M")
  })

  it("promotes to the next unit instead of printing 1000.0K", () => {
    expect(formatTokens(999)).toBe("999")
    expect(formatTokens(999_949)).toBe("999.9K")
    expect(formatTokens(999_999)).toBe("1M")
    expect(formatTokens(1_000_000_000)).toBe("1B")
  })

  it("treats invalid input as zero", () => {
    expect(formatTokens(Number.NaN)).toBe("0")
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe("0")
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

describe("formatDuration", () => {
  it("renders seconds under a minute", () => {
    expect(formatDuration(1_000)).toBe("1s")
    expect(formatDuration(45_900)).toBe("45s")
  })

  it("renders minutes with zero-padded seconds", () => {
    expect(formatDuration(754_000)).toBe("12m 34s")
    expect(formatDuration(60_000)).toBe("1m 00s")
  })

  it("drops seconds once hours are in play", () => {
    expect(formatDuration(3_600_000)).toBe("1h 00m")
    expect(formatDuration(11_100_000)).toBe("3h 05m")
  })

  it("treats absent or invalid durations as zero", () => {
    expect(formatDuration(0)).toBe("0s")
    expect(formatDuration(-1)).toBe("0s")
    expect(formatDuration(Number.NaN)).toBe("0s")
  })
})

describe("formatCost", () => {
  it("renders two decimals", () => {
    expect(formatCost(0.42)).toBe("$0.42")
    expect(formatCost(12.344)).toBe("$12.34")
    expect(formatCost(12.345)).toBe("$12.35")
  })

  it("collapses sub-cent spend instead of showing a false zero", () => {
    expect(formatCost(0.0001)).toBe("<$0.01")
  })

  it("treats absent or invalid spend as zero", () => {
    expect(formatCost(0)).toBe("$0.00")
    expect(formatCost(-3)).toBe("$0.00")
    expect(formatCost(Number.NaN)).toBe("$0.00")
  })
})

describe("formatRate", () => {
  it("renders one decimal below three digits", () => {
    expect(formatRate(12.64)).toBe("12.6 tok/s")
    expect(formatRate(99.9)).toBe("99.9 tok/s")
  })

  it("drops the decimal at three digits", () => {
    expect(formatRate(158.4)).toBe("158 tok/s")
  })

  it("treats absent or invalid rates as zero", () => {
    expect(formatRate(0)).toBe("0 tok/s")
    expect(formatRate(-1)).toBe("0 tok/s")
    expect(formatRate(Number.NaN)).toBe("0 tok/s")
  })
})
