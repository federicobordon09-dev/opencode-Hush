import { execFileSync, execSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/**
 * verify:pack — proves the *published artifact* works, not the checkout.
 *
 * 1. `pnpm pack` (which runs `prepack` -> the build) into a temp directory
 *    inside the repository, so bare imports coming from the extracted files
 *    still resolve against this repo's node_modules.
 * 2. assert the tarball carries dist/tui.js and dist/index.js — a clean clone
 *    must pack a dist, not just a src.
 * 3. lay the tarball out the way a host installs a plugin:
 *    <tmp>/install/node_modules/opencode-hush next to a package.json, plus a
 *    flat copy of the same bytes outside any node_modules path.
 * 4. fail when any shipped dist/src file imports @opencode/plugin at runtime:
 *    the package keeps it as a devDependency, so a value import would crash
 *    the host on load. Type-only imports are erased by the compilers.
 * 5. fail when any shipped dist file references a React JSX runtime: dist is
 *    precompiled JavaScript with Solid-transformed JSX, so a "react" or
 *    "jsx-dev-runtime" fingerprint means the build shipped the wrong transform.
 * 6. run the real `Host.resolve` from @opencode/plugin against that install.
 *    Package plugins are resolved by name, so both entrypoints must come back
 *    pointing inside the install.
 * 7. import the packaged entrypoints for real with Node and fail when either
 *    module has no default export. dist/index.js re-exports plain TypeScript
 *    (Node strips its types); dist/tui.js ships precompiled Solid JSX, so it
 *    loads on Node with no transpiler — externals resolve against this repo's
 *    node_modules.
 * 8. fail when the README points at an image with a relative path, which is
 *    broken once npm renders it.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const TEMP = path.join(ROOT, "verify-pack-tmp")
const PACKAGE_NAME = "opencode-hush"
const PACKED = path.join(TEMP, "install", "node_modules", PACKAGE_NAME)
const COPY = path.join(TEMP, "pkg")

const slashes = (value) => value.split(path.sep).join("/")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function run(command) {
  return execSync(command, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

/**
 * Line numbers of runtime imports of "@opencode/plugin": value imports,
 * side-effect imports, dynamic `import()` and `require`. `import type` and
 * `export type` are erased by the compilers, so they never reach the host and
 * are allowed; comment-looking lines are skipped.
 */
function pluginImportViolations(source) {
  const violations = []
  let typeOnlyOpen = false
  source.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) return
    if (/^\s*(?:import|export)\s+type\b/.test(line)) {
      if (!/\bfrom\b/.test(line)) typeOnlyOpen = true
      return
    }
    if (typeOnlyOpen) {
      if (/\bfrom\b/.test(line)) typeOnlyOpen = false
      return
    }
    const runtime =
      /\bfrom\s*["']@opencode\/plugin/.test(line) ||
      /^\s*import\s*["']@opencode\/plugin/.test(line) ||
      /\bimport\s*\(\s*["']@opencode\/plugin/.test(line) ||
      /\brequire\s*\(\s*["']@opencode\/plugin/.test(line)
    if (runtime) violations.push(index + 1)
  })
  return violations
}

async function pack() {
  const last = run(`pnpm pack --pack-destination "${TEMP}"`)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1)
  const tarball = path.isAbsolute(last) ? last : path.join(TEMP, last)
  assert(existsSync(tarball), `pnpm pack produced no tarball (last line: ${last})`)
  return tarball
}

async function main() {
  await rm(TEMP, { recursive: true, force: true })
  await mkdir(TEMP, { recursive: true })

  // 1. pack
  const tarball = await pack()
  console.log(`  pack        ${path.relative(ROOT, tarball)}`)

  // 2. packaging contents
  const contents = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
  for (const required of [
    "package/package.json",
    "package/README.md",
    "package/dist/index.js",
    "package/dist/tui.js",
    "package/src/index.ts",
    "package/src/tui.tsx",
  ]) {
    assert(contents.includes(required), `tarball is missing ${required}`)
  }
  assert(
    !contents.some((entry) => entry.startsWith("package/node_modules/")),
    "tarball must not carry node_modules",
  )
  console.log(`  contents    ${contents.length} files, dist/index.js + dist/tui.js present`)

  // 3. install the tarball the way a host does
  await mkdir(path.join(TEMP, "install", "node_modules"), { recursive: true })
  execFileSync("tar", ["-xzf", tarball, "-C", path.join(TEMP, "install", "node_modules")])
  await rename(path.join(TEMP, "install", "node_modules", "package"), PACKED)
  await writeFile(
    path.join(TEMP, "install", "package.json"),
    `${JSON.stringify({ name: "hush-verify-pack", private: true, version: "0.0.0" }, null, 2)}\n`,
  )

  // a second, flat copy: same bytes, but outside any node_modules path, so the
  // test loader treats it as source instead of an external dependency
  await mkdir(COPY, { recursive: true })
  execFileSync("tar", ["-xzf", tarball, "-C", COPY, "--strip-components", "1"])

  // 4. no shipped file may import @opencode/plugin at runtime: the package
  //    keeps it as a devDependency, so a value import would crash the host on
  //    load. Type-only imports are erased by the compilers and are fine.
  const shipped = []
  for (const entry of contents) {
    if (!/^package\/(?:dist|src)\//.test(entry)) continue
    if (!/\.(?:js|mjs|cjs|ts|tsx)$/.test(entry)) continue
    const lines = pluginImportViolations(
      await readFile(path.join(COPY, entry.slice("package/".length)), "utf8"),
    )
    assert(
      lines.length === 0,
      `runtime @opencode/plugin import in ${entry} on line(s) ${lines.join(", ")}`,
    )
    shipped.push(entry)
  }
  console.log(`  imports     no runtime @opencode/plugin import across ${shipped.length} shipped file(s)`)

  // 4b. dist ships precompiled JavaScript: React's JSX runtimes must never
  //     appear there. A fingerprint means the build regressed to React's
  //     importer instead of the Solid transform. Word boundaries avoid false
  //     positives like "reactive" in unrelated identifiers.
  for (const entry of contents) {
    if (!/^package\/dist\//.test(entry)) continue
    if (!/\.(?:m|c)?js$/.test(entry)) continue
    const source = await readFile(path.join(COPY, entry.slice("package/".length)), "utf8")
    const fingerprints = []
    if (/\breact\b/.test(source)) fingerprints.push("react")
    if (/jsx-dev-runtime/.test(source)) fingerprints.push("jsx-dev-runtime")
    assert(
      fingerprints.length === 0,
      `${entry} ships a React JSX fingerprint: ${fingerprints.join(", ")}`,
    )
  }
  console.log(`  jsx         dist clean of react / jsx-dev-runtime fingerprints`)

  // 5. the real resolver
  const { Host } = await import("@opencode/plugin/host")
  const resolved = Host.resolve({ directory: path.join(TEMP, "install"), name: PACKAGE_NAME })
  assert(
    typeof resolved.server === "string",
    `Host.resolve returned server: ${resolved.server} for the installed tarball`,
  )
  assert(
    typeof resolved.tui === "string",
    `Host.resolve returned tui: ${resolved.tui} for the installed tarball`,
  )
  const entrypoints = { server: fileURLToPath(resolved.server), tui: fileURLToPath(resolved.tui) }
  for (const [name, expected] of [
    ["server", "dist/index.js"],
    ["tui", "dist/tui.js"],
  ]) {
    assert(
      entrypoints[name] === path.join(PACKED, expected),
      `Host.resolve ${name} = ${entrypoints[name]}, expected ${path.join(PACKED, expected)}`,
    )
  }
  console.log(`  resolve     server=${slashes(path.relative(TEMP, entrypoints.server))}`)
  console.log(`              tui=${slashes(path.relative(TEMP, entrypoints.tui))}`)

  // The imports below run against the flat copy — same bytes, but outside any
  // node_modules path, because Node refuses to strip types under node_modules
  // and the test loader externalizes anything found there. The hashes tie the
  // copy back to the files Host.resolve just picked.
  for (const file of ["dist/index.js", "dist/tui.js"]) {
    const installed = await readFile(path.join(PACKED, file))
    const copy = await readFile(path.join(COPY, file))
    assert(sha256(installed) === sha256(copy), `${file} differs between the two extractions`)
  }

  // 6a. the server entrypoint, imported by Node
  const helper = path.join(TEMP, "import-entry.mjs")
  await writeFile(
    helper,
    [
      'const module = await import(process.argv[2])',
      "const plugin = module.default",
      "const report = {",
      '  hasDefault: Object.hasOwn(module, "default"),',
      "  keys: Object.keys(module),",
      "  id: plugin?.id,",
      "  setup: typeof plugin?.setup,",
      "}",
      "process.stdout.write(JSON.stringify(report))",
      'process.exitCode = report.hasDefault && report.setup === "function" ? 0 : 1',
      "",
    ].join("\n"),
  )
  // Node >= 22.18 (and 24) strips TypeScript types by default; older 22.x needs
  // the flag, which `engines` still allows.
  const nodeFlags = process.features.typescript ? [] : ["--experimental-strip-types", "--no-warnings"]
  let serverReport
  try {
    serverReport = JSON.parse(
      execFileSync(
        process.execPath,
        [...nodeFlags, helper, pathToFileURL(path.join(COPY, "dist", "index.js")).href],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    )
  } catch (error) {
    throw new Error(
      `importing the packaged server entrypoint failed:\n${error.stdout ?? ""}${error.stderr ?? ""}`,
    )
  }
  assert(
    serverReport.hasDefault,
    `the packaged server entrypoint has no default export (exports: ${serverReport.keys.join(", ") || "none"})`,
  )
  assert(
    serverReport.id === "hush" && serverReport.setup === "function",
    `the packaged server entrypoint is not a plugin: ${JSON.stringify(serverReport)}`,
  )
  console.log(`  import      dist/index.js -> default { id: "${serverReport.id}", setup: function }`)

  // 6b. the TUI entrypoint: precompiled by the build (babel-preset-solid via
  //     esbuild-plugin-solid), so plain Node imports it directly from the flat
  //     copy. The former vitest loader with its ephemeral JSX-pinning config is
  //     gone on purpose — the shipped artifact must not need a JSX transpiler
  //     at load time.
  let tuiReport
  try {
    tuiReport = JSON.parse(
      execFileSync(
        process.execPath,
        [helper, pathToFileURL(path.join(COPY, "dist", "tui.js")).href],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    )
  } catch (error) {
    throw new Error(
      `importing the packaged TUI entrypoint failed:\n${error.stdout ?? ""}${error.stderr ?? ""}`,
    )
  }
  assert(
    tuiReport.hasDefault,
    `the packaged TUI entrypoint has no default export (exports: ${tuiReport.keys.join(", ") || "none"})`,
  )
  assert(
    tuiReport.id === "hush" && tuiReport.setup === "function",
    `the packaged TUI entrypoint is not a plugin: ${JSON.stringify(tuiReport)}`,
  )
  console.log(`  import      dist/tui.js -> default { id: "${tuiReport.id}", setup: function }`)

  // 7. README images must survive npm, which renders them from the registry
  const readme = await readFile(path.join(PACKED, "README.md"), "utf8")
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((match) => match[1])
  const relative = images.filter((source) => !/^(https?:)?\/\//.test(source))
  assert(relative.length === 0, `README images must be absolute for npm: ${relative.join(", ")}`)
  console.log(`  readme      ${images.length} image(s), absolute sources only`)
}

let failure
try {
  console.log("verify:pack")
  await main()
} catch (error) {
  failure = error
}

if (failure) {
  console.error(`\nFAIL  ${failure.message}`)
  console.error(`      inspect: ${path.relative(ROOT, TEMP)}`)
  process.exitCode = 1
} else {
  await rm(TEMP, { recursive: true, force: true })
  console.log("\nOK    the tarball resolves, imports and documents itself")
}
