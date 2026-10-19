import { Plugin } from "@opencode/plugin/tui"

/**
 * Hush - minimal adaptive telemetry for the OpenCode TUI.
 *
 * Scaffold: claims a small block in the sidebar so the plugin pipeline can be
 * verified end to end. The adaptive telemetry engine lands in the next phase.
 */
export default Plugin.define({
  id: "hush",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: (input) => (
        <box flexDirection="column">
          <text fg={context.theme.text.base}>HUSH</text>
          <text fg={context.theme.text.muted}>telemetry scaffold</text>
          <text fg={context.theme.text.faint}>{input.sessionID}</text>
        </box>
      ),
    })
  },
})
