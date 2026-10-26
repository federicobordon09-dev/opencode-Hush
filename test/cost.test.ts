import { describe, expect, it } from "vitest"
import { isCostAvailable } from "../src/core/cost.ts"

describe("cost availability", () => {
  it("accepts zero and positive costs for an existing root", () => {
    expect(isCostAvailable(true, 0)).toBe(true)
    expect(isCostAvailable(true, 12.34)).toBe(true)
  })

  it("rejects an unavailable root or unsafe values", () => {
    expect(isCostAvailable(false, 0)).toBe(false)
    expect(isCostAvailable(true, Number.NaN)).toBe(false)
    expect(isCostAvailable(true, Number.POSITIVE_INFINITY)).toBe(false)
    expect(isCostAvailable(true, -1)).toBe(false)
  })

  it("reacts correctly when the active session resolves to different roots", () => {
    const roots = new Map([
      ["child-a", { exists: true, cost: 0 }],
      ["child-b", { exists: false, cost: 9 }],
      ["child-c", { exists: true, cost: 2 }],
    ])
    expect(isCostAvailable(roots.get("child-a")!.exists, roots.get("child-a")!.cost)).toBe(true)
    expect(isCostAvailable(roots.get("child-b")!.exists, roots.get("child-b")!.cost)).toBe(false)
    expect(isCostAvailable(roots.get("child-c")!.exists, roots.get("child-c")!.cost)).toBe(true)
  })
})
