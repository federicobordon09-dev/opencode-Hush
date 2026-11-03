import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

const panelSource = () => readFileSync(fileURLToPath(new URL("../src/panel.tsx", import.meta.url)), "utf8")

it("presents attention, error, active tool, and actual session state in priority order", () => {
  const source = panelSource()
  const labels = ["label=\"Permission\"", "label=\"Form\"", "label=\"Error\"", "label=\"Tool\"", "label=\"Session\""]
  const positions = labels.map((label) => source.indexOf(label))
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
})

it("reads only the host's running and idle status values", () => {
  expect(panelSource()).toMatch(/status\(\) === \"running\" \? \"Running\" : \"Idle\"/)
  expect(panelSource()).not.toMatch(/\b(busy|retry|blocked)\b/)
})
