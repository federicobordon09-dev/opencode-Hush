import { mkdir, writeFile } from "node:fs/promises"
import esbuild from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"

// The host load of the TUI entrypoint cannot stay a TSX re-export: OpenCode's
// CLI-side plugin reconciliation imports `dist/tui.js` and its oxc pipeline
// defaults to React's JSX importer, which crashes with "Cannot find package
// 'react' imported from .../opencode-hush/src/tui.tsx" (stage=load, target
// opencode-hush). So `dist/tui.js` is a real precompiled bundle now: JSX
// transformed, TypeScript erased, and `src/*` not needed load time.
//
// The transform is the official Solid one. `@opentui/solid` documents building
// through its own `@opentui/solid/bun-plugin` (README §"To build", source:
// github.com/anomalyco/opentui — issue #122); that plugin just runs
// babel-preset-solid with `{ moduleName: "@opentui/solid", generate:
// "universal" }` (scripts/solid-transform.js). Its Node entrypoint is Bun-only
// by design, so the same preset is routed through the esbuild plugin that
// OpenCode TUI plugins in npm use for exactly this file:
// `esbuild-plugin-solid` + `babel-preset-solid` — opencode-subagent-statusline
// compiles its `dist/tui.js` the same way (tsup + esbuild-plugin-solid 0.6.0;
// its bundle imports the very same `_$createElement`/`_$insert`/... helpers
// from "@opentui/solid"). No custom plugin is rolled here.
//
// Externals stay imports:
// - `@opentui/*` and `solid-js` are peerDependencies; both live in the host's
//   plugin install tree, so sharing the host's Solid runtime stays correct.
// - `@opencode/plugin` is never a runtime import of this package (type-only),
//   and it stays external so that were that ever to regress the bare specifier
//   would survive into the artifact — where verify:pack's import scan fails
//   it — instead of being silently inlined.
//
// `dist/index.js` is the server entrypoint: the module holds no JSX, the host
// strips plain TypeScript, and both `Host.resolve` probes for a package plugin
// (`<name>/server`, then the package root) find a file. It must be an explicit
// `export { default }`: in ESM `export *` does not forward a default binding,
// so `export * from "../src/index.ts"` left the published plugin without the
// plugin object the host looks for.

await esbuild.build({
  entryPoints: ["src/tui.tsx"],
  outfile: "dist/tui.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["esnext"],
  sourcemap: false,
  external: ["@opentui/*", "solid-js", "solid-js/*", "@opencode/plugin", "@opencode/plugin/*"],
  plugins: [
    solidPlugin({
      // Not in the shipped artifact: inline Babel maps would ship the TSX
      // inside dist and bloat the package.
      babel: { sourceMaps: false },
      solid: {
        // The exact options @opentui/solid passes for its documented build.
        moduleName: "@opentui/solid",
        generate: "universal",
      },
    }),
  ],
})
console.log("built dist/tui.js")

const entries = {
  "dist/index.js": 'export { default } from "../src/index.ts"\n',
}

await mkdir("dist", { recursive: true })
for (const [file, contents] of Object.entries(entries)) {
  await writeFile(file, contents)
  console.log(`built ${file}`)
}
