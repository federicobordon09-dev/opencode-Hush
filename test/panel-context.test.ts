import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

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
