/**
 * Update check math.
 *
 * The host owns plugin installation: `plugin.check` reports the package it
 * installed, its version and whether a newer one exists. Hush only classifies
 * that answer — it never guesses a version and never talks to the registry.
 */

/** A package plugin as the host reports it, reduced to what the check reads. */
export type PackagePluginSource = {
  readonly type: "package"
  readonly target: string
  readonly version?: string
  readonly outdated?: true
}

/** One entry of the host's plugin list, reduced to what the check reads. */
export type PluginSnapshot = {
  readonly source:
    | PackagePluginSource
    | { readonly type: "builtin" }
    | { readonly type: "local"; readonly path: string }
    | { readonly type: "sdk" }
  readonly state?: { readonly status: "active" } | { readonly status: "failed"; readonly error: string }
}

export type UpdateStatus =
  /** The host does not list Hush as a package plugin: nothing to update. */
  | { readonly state: "missing" }
  /** Hush is installed and the host reports no newer version. */
  | { readonly state: "current"; readonly version?: string }
  /** The host reports a newer version published for the installed package. */
  | { readonly state: "outdated"; readonly version?: string }
  /** Hush is installed but the host could not load it. */
  | { readonly state: "failed"; readonly error: string }

/** Classifies Hush's entry in the host's plugin list. */
export function updateStatus(plugins: readonly PluginSnapshot[], target: string): UpdateStatus {
  const entry = plugins.find((plugin) => isPackage(plugin, target))
  if (entry === undefined) return { state: "missing" }
  if (entry.state?.status === "failed") return { state: "failed", error: entry.state.error }
  const version = entry.source.version
  return entry.source.outdated === true ? { state: "outdated", version } : { state: "current", version }
}

function isPackage(
  plugin: PluginSnapshot,
  target: string,
): plugin is PluginSnapshot & { readonly source: PackagePluginSource } {
  return plugin.source.type === "package" && plugin.source.target === target
}
