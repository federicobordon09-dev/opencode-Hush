import { describe, expect, it } from "vitest"

import { updateStatus, type PluginSnapshot } from "../src/core/update.ts"

const builtin: PluginSnapshot = { source: { type: "builtin" }, state: { status: "active" } }
const local: PluginSnapshot = { source: { type: "local", path: "/tmp/hush.ts" }, state: { status: "active" } }

describe("updateStatus", () => {
  it("reports missing when the host lists no package plugin with that target", () => {
    expect(updateStatus([], "opencode-hush")).toEqual({ state: "missing" })
    expect(updateStatus([builtin, local], "opencode-hush")).toEqual({ state: "missing" })
  })

  it("ignores other package plugins", () => {
    const other: PluginSnapshot = {
      source: { type: "package", target: "opencode-subagent-statusline", version: "2.1.0", outdated: true },
    }
    expect(updateStatus([other], "opencode-hush")).toEqual({ state: "missing" })
  })

  it("reports current with the installed version when the host sees no newer release", () => {
    const plugin: PluginSnapshot = { source: { type: "package", target: "opencode-hush", version: "0.2.2" } }
    expect(updateStatus([plugin], "opencode-hush")).toEqual({ state: "current", version: "0.2.2" })
  })

  it("reports outdated with the installed version when the host flags a newer release", () => {
    const plugin: PluginSnapshot = {
      source: { type: "package", target: "opencode-hush", version: "0.2.2", outdated: true },
    }
    expect(updateStatus([plugin], "opencode-hush")).toEqual({ state: "outdated", version: "0.2.2" })
  })

  it("keeps the version optional: a host that cannot resolve it still reports state", () => {
    const plugin: PluginSnapshot = { source: { type: "package", target: "opencode-hush", outdated: true } }
    expect(updateStatus([plugin], "opencode-hush")).toEqual({ state: "outdated", version: undefined })
  })

  it("surfaces a failed install instead of pretending it is current", () => {
    const plugin: PluginSnapshot = {
      source: { type: "package", target: "opencode-hush", version: "0.2.2" },
      state: { status: "failed", error: "Cannot find module" },
    }
    expect(updateStatus([plugin], "opencode-hush")).toEqual({ state: "failed", error: "Cannot find module" })
  })
})
