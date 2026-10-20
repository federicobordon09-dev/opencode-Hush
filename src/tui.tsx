/**
 * Hush — minimal telemetry for the OpenCode TUI.
 *
 * The plugin only contributes to slots the host publishes; it never patches the
 * host UI, opens its own surface, or talks to anything outside the local
 * OpenCode runtime. All data comes from the plugin context: session state, the
 * host store, and the event stream.
 */

import { Plugin } from "@opencode/plugin/tui"

import { HushPanel } from "./panel.tsx"

export default Plugin.define({
  id: "hush",

  setup(context) {
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
})
