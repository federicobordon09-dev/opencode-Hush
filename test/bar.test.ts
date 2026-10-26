import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

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

/**
 * Guard: the fill has to be derived inside a reactive scope.
 *
 * Solid hands a component its props as getters; a plain `const fill =
 * barFill(props.ratio)` reads the ratio once, when the bar mounts, and the fill
 * then stays frozen at that width for the life of the panel. The panel is
 * render-only and needs a host to mount, so this guard reads the source — same
 * pattern as panel-context.test.ts and panel-colors.test.ts.
 */
const barSource = () => {
  const source = readFileSync(fileURLToPath(new URL("../src/panel.tsx", import.meta.url)), "utf8")
  const start = source.indexOf("function Bar(")
  return source.slice(start, source.indexOf("\nfunction ", start + 1))
}

it("derives the bar fill reactively, not once at mount", () => {
  expect(barSource()).toMatch(/createMemo\(\(\) => barFill\(props\.ratio\)\)/)
})
