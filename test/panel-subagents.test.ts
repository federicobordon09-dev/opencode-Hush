import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

/**
 * Guard: Hush does not render subagents — the host already owns that UI.
 *
 * OpenCode's sidebar already shows subagent sessions in the family tree.
 * Hush adds only what the host does not draw (context pressure, Git branch,
 * model/cost/tokens, age, reasoning). The subagent data is still collected
 * in telemetry.ts for potential consumers, but the panel source must not
 * contain any subagent rendering logic.
 */
const panelSource = () =>
  readFileSync(fileURLToPath(new URL("../src/panel.tsx", import.meta.url)), "utf8")

it("renders no Subagents section or label in JSX", () => {
  const source = panelSource()
  // Check for actual rendering code, not comments
  expect(source).not.toMatch(/<[^>]*[Ss]ubagent/)
  expect(source).not.toMatch(/{[^}]*[Ss]ubagent/)
  expect(source).not.toMatch(/[Ss]ubagent[^a-z]*[Rr]ow/)
  expect(source).not.toMatch(/[Ss]ubagent[^a-z]*[Ss]ection/)
})

it("renders no subagent row components or mappings", () => {
  const source = panelSource()
  expect(source).not.toMatch(/subagentsView/)
  expect(source).not.toMatch(/SubagentRow/)
  expect(source).not.toMatch(/subagentState/)
  expect(source).not.toMatch(/subagentName/)
  expect(source).not.toMatch(/subagentDescription/)
})

it("telemetry still collects subagent snapshots for consumers", () => {
  const telemetrySource = readFileSync(
    fileURLToPath(new URL("../src/telemetry.ts", import.meta.url)),
    "utf8"
  )
  expect(telemetrySource).toMatch(/subagents/)
  expect(telemetrySource).toMatch(/SubagentSnapshot/)
  expect(telemetrySource).toMatch(/data\.session\.family/)
  expect(telemetrySource).toMatch(/parentID/)
})

it("core subagents logic remains tested and functional", () => {
  const coreSource = readFileSync(
    fileURLToPath(new URL("../src/core/subagents.ts", import.meta.url)),
    "utf8"
  )
  expect(coreSource).toMatch(/export function subagentsView/)
  expect(coreSource).toMatch(/export function subagentState/)
  expect(coreSource).toMatch(/export function subagentName/)
  expect(coreSource).toMatch(/SUBAGENT_ROW_CAP/)
})