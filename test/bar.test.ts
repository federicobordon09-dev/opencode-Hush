import { describe, expect, it } from "vitest"

import { barFill } from "../src/core/bar.ts"

describe("barFill", () => {
  it("draws no fill at zero, so the bar stays a full faint track", () => {
    expect(barFill(0)).toEqual({ width: "0%", minWidth: 0 })
  })

  it("keeps the fill visible at one cell for a tiny ratio in a narrow sidebar", () => {
    expect(barFill(0.04)).toEqual({ width: "4%", minWidth: 1 })
  })

  it("claims the entire row at a full ratio", () => {
    expect(barFill(1)).toEqual({ width: "100%", minWidth: 1 })
  })
})
