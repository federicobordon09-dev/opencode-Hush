/**
 * Palette and slash commands Hush contributes to the host.
 *
 * The update command is a thin client over the host's own plugin API: the host
 * owns installation and version detection, Hush only asks and relays the answer.
 * An update replaces the files on disk, so the new code loads on the next TUI
 * start; the command says so instead of pretending it hot-swaps itself.
 */

import type { Plugin } from "@opencode/plugin/tui"

import { updateStatus } from "./core/update.ts"

/** The npm package name the host installs Hush under. */
const PACKAGE = "opencode-hush"

/** One run at a time: the palette and the slash command share this flag. */
let updating = false

export function registerCommands(context: Plugin.Context): void {
  context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "hush.update",
        title: "Hush: check for updates",
        group: "Hush",
        palette: true,
        slash: { name: "hush-update" },
        run: () => checkForUpdates(context),
      },
    ],
  }))
}

async function checkForUpdates(context: Plugin.Context): Promise<void> {
  if (updating) return
  updating = true
  try {
    const location = context.location ?? context.data.location.default()
    const { data } = await context.client.plugin.check({ location })
    const status = updateStatus(data, PACKAGE)

    switch (status.state) {
      case "missing":
        context.ui.toast.show({
          title: "Hush",
          message: "Hush is not installed as a package plugin, so there is nothing to update.",
          variant: "warning",
        })
        return
      case "failed":
        context.ui.toast.show({
          title: "Hush",
          message: `Hush failed to load: ${status.error}`,
          variant: "error",
        })
        return
      case "current":
        context.ui.toast.show({
          title: "Hush",
          message: status.version === undefined ? "Hush is up to date." : `Hush ${status.version} is up to date.`,
          variant: "success",
        })
        return
      case "outdated":
        break
    }

    const installed = status.version === undefined ? "Hush" : `Hush ${status.version}`
    const confirmed = await context.ui.dialog.confirm({
      title: "Update Hush",
      message: `${installed} is installed and a newer version is available. Update now? OpenCode has to restart to load it.`,
      label: { confirm: "Update", cancel: "Cancel" },
    })
    if (confirmed !== true) return

    // The install runs npm and can take a minute, so acknowledge before awaiting it.
    context.ui.toast.show({ title: "Hush", message: "Updating Hush…", variant: "info", duration: 60_000 })
    await context.client.plugin.update({ targets: [PACKAGE], location })
    context.ui.toast.show({
      title: "Hush",
      message: "Hush updated. Restart OpenCode to load the new version.",
      variant: "success",
      duration: 8_000,
    })
  } catch (error) {
    context.ui.toast.show({
      title: "Hush",
      message: `Hush update failed: ${errorMessage(error)}`,
      variant: "error",
    })
  } finally {
    updating = false
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
