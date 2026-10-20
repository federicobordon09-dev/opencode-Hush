import { expect, it } from "vitest"

it("loads the TUI entrypoint without a host", async () => {
  const module = await import("../src/tui.tsx")
  expect(module.default.id).toBe("hush")
  expect(typeof module.default.setup).toBe("function")
})
