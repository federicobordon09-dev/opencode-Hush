# Hush

Minimal telemetry for the [OpenCode](https://opencode.ai) TUI. Quiet while everything is healthy, specific when something needs attention.

![Hush telemetry panel mockup](docs/design/hush-panel-mockup.png)

> **Status:** v0.1.0 — sidebar telemetry panel. Every figure comes from the plugin context; nothing is estimated, scraped, or fetched from outside the local runtime.

## What it shows

| Section | Content | Where it comes from |
| --- | --- | --- |
| **Context** | tokens in the window, model limit, pressure bar | last assistant message carrying usage, after the last completed compaction and before the revert boundary; limit from `ModelInfo.limit.context` |
| **Git** | current branch | `data.location.vcs.info()` |
| **Meta** | model, family cost, family tokens, family cached tokens, elapsed time, active reasoning | session store plus `session.reasoning.*` events |

Sections with no data render nothing. A missing limit still shows tokens, just without a pressure bar.

### Semantics that matter

- **Context ≠ session total.** Context is the tokens the current window holds, computed with the host's own algorithm (`lastAssistantWithUsage` plus the full token sum). The cumulative figures are labelled `Tokens` and `Cached`, so the two are never mixed.
- **Tokens** is what the family processed: `input + output + reasoning + cache.write`, summed over the root session and every session the host groups under it. Cached reads are deliberately not part of it.
- **Cached** is the family's `cache.read`: the prompt the provider served from its cache. Those tokens are billed, but the model did not process them again, so they get their own dim row instead of inflating `Tokens`.
- **Cost** is the family total the host reports for the root session, so subagent spend is counted once. `Tokens` and `Cached` use that same family, so the three figures describe the same work.
- **Elapsed** is wall clock since the session was created, ticked by the plugin's own one-second clock. It is not a model timer and it keeps running while the assistant is idle.
- **Reasoning** reads `active` only while reasoning content streams (`session.reasoning.started` → `ended` / idle / execution end). It is never inferred from a model name or from timing, and the row is hidden when reasoning is not active.
- **Pressure** is the only adaptive behavior in this version: `calm` below 70%, `warn` at 70%, `critical` at 90%. It colors the Context dot and the pressure bar.

### Who draws what

The sidebar is shared by three layers. Hush only draws what the other two leave out.

| Layer | Draws |
| --- | --- |
| **OpenCode host** (`packages/tui/src/feature-plugins/sidebar/context.tsx`) | the `Context` header, absolute tokens, the `NN% used` percentage and, when the session has cost, a `$X spent` line |
| **`opencode-subagent-statusline`** | the `▼ Subagents` block: per-agent state, elapsed time and tokens — it sums `input + output` only |
| **Hush** | the context pressure bar (no percentage), the Git branch, the model, the family `Cost`, the family `Tokens`, the family `Cached` and the `Elapsed` clock |

So:

- Hush never repeats the host's `NN% used` line, and never repeats the statusline's per-agent token counts.
- `Tokens` and `Cached` are neither the statusline's per-agent numbers nor the host's context figure: they are the family's cumulative processed and cached tokens.
- The host's `$ spent` line and Hush's `Cost` row describe the same family total while the session on screen is the root. Opening a child session makes the host report only that child's cost while Hush keeps reporting the family.

## Limitations

- **No duplicated host data.** OpenCode already renders MCP status, subagent status and the prompt footer, so Hush does not claim those slots. The sidebar panel adds only context, Git and the secondary session metrics.
- **Subagents are host-owned.** Hush does not render its own agent list; the host remains the source of truth for subagent state, duration and tokens.
- **No tokens per second.** The host's usage event arrives when a step closes, not while the model streams, so there is no honest source for a generation speed. Hush reports totals instead of a rate it cannot measure.
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
    format.ts    Token, percent, duration and cost formatting
    usage.ts     Token totals, context window, pressure
test/            Vitest unit tests
scripts/         Build helpers
docs/design/     Design references
```

## License

MIT
