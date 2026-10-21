/**
 * Hush is a TUI-only plugin, but OpenCode resolves a *package* plugin by
 * probing for two entrypoints: `Host.resolve` asks for `<name>/server` or the
 * package root for the server side, and `<name>/tui` for the TUI side. Without
 * a server entrypoint the tarball installs but resolves to `server: undefined`,
 * so the plugin is never seen as complete.
 *
 * This module satisfies that contract and intentionally does nothing: every
 * metric, slot claim and event subscription lives in `tui.tsx`, which runs in
 * the TUI process. It is the packaged twin of the local shim at
 * `~/.config/opencode/plugins/hush/server.ts` — same object, same `id`, typed
 * against the host's own server-side `Plugin` interface.
 *
 * The import is type-only on purpose: importing `dist/index.js` should never
 * pull a runtime dependency, which keeps the entrypoint loadable anywhere.
 */

import type { Plugin } from "@opencode/plugin"

const server: Plugin.Plugin = {
  id: "hush",
  setup() {
    return () => {}
  },
}

export default server
