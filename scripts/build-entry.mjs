import { mkdir, writeFile } from "node:fs/promises"

// OpenCode's host runtime transpiles TypeScript on load, so the published
// entry only needs to re-export the source. This keeps the package free of a
// bundler while still giving npm a plain .js entrypoint.
await mkdir("dist", { recursive: true })
await writeFile("dist/tui.js", 'export * from "../src/tui.tsx"\n')

console.log("built dist/tui.js")
