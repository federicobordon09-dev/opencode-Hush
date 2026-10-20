# Hush

Minimal telemetry for the [OpenCode](https://opencode.ai) TUI. Quiet while everything is healthy, specific when something needs attention.

![Hush telemetry panel mockup](docs/design/hush-panel-mockup.png)

> **Status:** v0.1.0 — sidebar telemetry panel. Every figure comes from the plugin context; nothing is estimated, scraped, or fetched from outside the local runtime.

## What it shows

| Section | Content | Where it comes from |
| --- | --- | --- |
| **Context** | tokens in the window, model limit, pressure bar | last assistant message carrying usage, after the last completed compaction and before the revert boundary; limit from `ModelInfo.limit.context` |
| **Git** | current branch | `data.location.vcs.info()` |
| **Meta** | model, session cost, live tok/s, session tokens, elapsed time, active reasoning | session store plus `session.usage.updated` and `session.reasoning.*` events |

Sections with no data render nothing. A missing limit still shows tokens, just without a pressure bar.

### Semantics that matter

- **Context ≠ session total.** Context is the tokens the current window holds. The cumulative figure is labelled `Tokens` in the summary block, so the two are never mixed.
- **Cost** is the family total the host reports for the root session, so subagent spend is counted once.
- **Generation speed** is sampled from successive `session.usage.updated` events over a rolling 8 s window. It disappears when there are too few samples, they are closer than 400 ms, they are stale, or they show no growth.
- **Reasoning** reads `active` only while reasoning content streams (`session.reasoning.started` → `ended` / idle / execution end). It is never inferred from a model name or from timing, and the row is hidden when reasoning is not active.
- **Pressure** is the only adaptive behavior in this version: `calm` below 70%, `warn` at 70%, `critical` at 90%. It colors the Context dot and the pressure bar.

## Limitations

- **No duplicated host data.** OpenCode already renders MCP status, subagent status and the prompt footer, so Hush does not claim those slots. The sidebar panel adds only context, Git and the secondary session metrics.
- **Subagents are host-owned.** Hush does not render its own agent list; the host remains the source of truth for subagent state, duration and tokens.
- **Model names truncate, not wrap.** The Model row keeps the label column fixed and ellipsizes a long name, so it never pushes the sidebar wider.
- **Git is branch only.** The plugin API exposes `VcsInfo` with the current branch, not a diff count. Hush therefore never claims dirty files or `+n −n`.
- **Plan/quota is not implemented.** The plugin API does not expose plan usage. Hush does not call undocumented endpoints, read credentials, or infer a plan from cost.

## Configuration

Add the package to the `plugins` array in `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["opencode-hush"]
}
```

### Run from a local checkout

OpenCode 2 discovers local plugins from `~/.config/opencode/plugins/`. A
directory there must provide a server entrypoint **and** a TUI entrypoint:

```text
~/.config/opencode/plugins/hush/
  server.ts   # required by the host; Hush is TUI-only, so this one is inert
  tui.tsx     # re-exports the plugin from this repository
```

`tui.tsx` is a one-line shim, so edits in `src/` are picked up without a build:

```ts
export { default } from "../../../../Desktop/Hush/src/tui.tsx"
```

## Development

Requires Node.js 20+ and pnpm.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Structure

```
src/
  tui.tsx        TUI entrypoint: claims slots and releases them on deactivate
  telemetry.ts   Reactive session state: store reads, clock, event subscriptions
  panel.tsx      Presentation: sidebar panel
  core/
    format.ts    Token, percent, duration, cost and rate formatting
    usage.ts     Token totals, context window, pressure, generation rate
test/            Vitest unit tests
scripts/         Build helpers
docs/design/     Design references
```

## License

MIT
