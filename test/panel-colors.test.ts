import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

/**
 * Guard: panel colors must come from the host theme, never from hex literals.
 *
 * Hush resolves every color through `ResolvedTheme` tokens (types cited in
 * src/panel.tsx). The only hex a render file may ever contain is the single
 * documented runtime fallback for a token the host did not deliver; today the
 * accent fallback is a token (`theme.text.base`), so the list stays empty. If a
 * hex fallback is ever required, register it here — once — and document it in
 * the file header alongside `accentColor`.
 */
const ALLOWED_FALLBACK: readonly string[] = []

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g

const panelSource = () =>
  readFileSync(fileURLToPath(new URL("../src/panel.tsx", import.meta.url)), "utf8")

it("src/panel.tsx paints with theme tokens, not hex colors", () => {
  const found = [...panelSource().matchAll(HEX)].map((match) => match[0])
  const offenders = found.filter((hex) => !ALLOWED_FALLBACK.includes(hex.toLowerCase()))
  expect(offenders, `hardcoded colors in src/panel.tsx: ${offenders.join(", ")}`).toEqual([])
})
