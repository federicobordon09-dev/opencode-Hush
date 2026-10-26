/**
 * Hush — minimal telemetry for the OpenCode TUI.
 *
 * The plugin only contributes to slots the host publishes; it never patches the
 * host UI, opens its own surface, or talks to anything outside the local
 * OpenCode runtime. All data comes from the plugin context: session state, the
 * host store, and the event stream.
 */

import type { Plugin } from "@opencode/plugin/tui"

import { registerCommands } from "./commands.ts"
import { HushPanel } from "./panel.tsx"

export default {
  id: "hush",

  setup(context) {
    registerCommands(context)

    const claims: Array<() => void> = [
      context.ui.slot({
        append: "sidebar.content",
        render: (input) => <HushPanel context={context} sessionID={input.sessionID} />,
      }),
    ]

    return () => {
      for (const claim of claims) claim()
    }
  },
} satisfies Plugin.Definition
