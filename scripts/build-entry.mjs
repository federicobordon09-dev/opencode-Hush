import { mkdir, writeFile } from "node:fs/promises"

// OpenCode's host runtime transpiles TypeScript on load, so the published
// entrypoints only need to re-export the source. This keeps the package free of
// a bundler while still giving npm plain .js entrypoints.
//
// The re-export must be an explicit `export { default }`: in ESM `export *`
// does not forward a default binding, so `export * from "../src/tui.tsx"` left
// the published plugin without the plugin object the host looks for.
//
// `dist/index.js` is the server entrypoint, so both `Host.resolve` probes for a
// package plugin (`<name>/server`, then the package root) find a file.
const entries = {
  "dist/tui.js": 'export { default } from "../src/tui.tsx"\n',
  "dist/index.js": 'export { default } from "../src/index.ts"\n',
}

await mkdir("dist", { recursive: true })
for (const [file, contents] of Object.entries(entries)) {
  await writeFile(file, contents)
  console.log(`built ${file}`)
}
