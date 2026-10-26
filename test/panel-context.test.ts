import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { METADATA_SYMBOLS } from "../src/panel.tsx"

/**
 * Guard: the Context row must carry only what the host does not draw.
 *
 * OpenCode's sidebar already labels the context block and shows the exact
 * token count and percentage. Hush adds the pressure dot, the compact usage
 * bar and the limit. The panel is render-only and hard to spin up without a
 * host, so this guard reads its source — the same source-level pattern as
 * panel-colors.test.ts — and fails if the host-duplicated label or token
 * count ever reappears.
 */
const panelSource = () =>
  readFileSync(fileURLToPath(new URL("../src/panel.tsx", import.meta.url)), "utf8")
const telemetrySource = () =>
  readFileSync(fileURLToPath(new URL("../src/telemetry.ts", import.meta.url)), "utf8")

it("renders no Context label of its own", () => {
  expect(panelSource()).not.toMatch(/>Context</)
})

it("renders no duplicated window token count", () => {
  expect(panelSource()).not.toMatch(/<text[^>]*>\s*tokens<\/text>/)
})

it("keeps one row with the pressure dot, the bar and the remaining label", () => {
  const source = panelSource()
  expect(source).toMatch(/<Bar\b/)
  expect(source).toMatch(/formatRemaining\(/)
})

it("renders Git through the Row component instead of a standalone heading", () => {
  const source = panelSource()
  expect(source).toMatch(/<Row label="Git"/)
  expect(source).not.toMatch(/<text fg=\{theme\.text\.muted\}>Git<\/text>/)
})

it("uses distinct semantic symbols for Git and every metadata indicator", () => {
  const symbols = Object.values(METADATA_SYMBOLS)
  expect(symbols).toHaveLength(7)
  expect(new Set(symbols).size).toBe(symbols.length)
  expect(METADATA_SYMBOLS).toEqual({
    model: "◈",
    cost: "$",
    tokens: "Σ",
    cached: "↻",
    age: "◷",
    reasoning: "∴",
    git: "⑂",
  })
})

it("keeps row symbols to one non-wrapping cell", () => {
  const source = panelSource()
  expect(source).toMatch(/<text fg=\{row\.color\} wrapMode="none" flexShrink=\{0\}>\{`\$\{row\.symbol\} `\}<\/text>/)
})

it("keeps branch truncation in the Git row", () => {
  const source = panelSource()
  expect(source).toMatch(/<Row label="Git"[\s\S]*?truncate/)
})

it("normalizes the Age section spacing to match the other sections", () => {
  const source = panelSource()
  expect(source).toMatch(
    /elapsedText\(\) !== undefined \|\| reasoningText\(\) !== undefined\}[\s\S]*?<box[^>]*marginTop=\{1\}/,
  )
})

it("lets the Context bar container shrink in narrow sidebars", () => {
  const source = panelSource()
  // The bar container must allow shrinking like the Row value column, so a
  // fixed limit label cannot squeeze the bar out in a narrow sidebar.
  expect(source).toMatch(/<box flexGrow=\{1\} flexShrink=\{1\} minWidth=\{0\}>/)
})

it("truncates every metadata value to avoid narrow-sidebar overflow", () => {
  const source = panelSource()
  // No metadata value may render without truncation, otherwise a long model
  // name or branch can push the row past the sidebar.
  expect(source).not.toMatch(/<text fg=\{theme\.text\.base\}>\{value\(\)\}<\/text>/)
  const truncated = [...source.matchAll(/truncate/g)].length
  expect(truncated).toBeGreaterThanOrEqual(7)
})

it("marks available but incomplete token totals as estimates", () => {
  const source = panelSource()
  expect(source).toMatch(/view\.tokensAvailable\(\) && value > 0/)
  expect(source).toMatch(/view\.tokensIncomplete\(\) \? "~" : ""/)
})

it("keeps zero cost visible only when the root session is available", () => {
  const source = panelSource()
  expect(source).toMatch(/view\.costAvailable\(\) \? formatCost\(value\) : undefined/)
  expect(telemetrySource()).toMatch(/data\.session\.get\(id\) !== undefined/)
})
