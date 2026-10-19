# Hush

Minimal adaptive telemetry for the [OpenCode](https://opencode.ai) TUI. Silent by default, loud only when it matters.

![Hush telemetry panel mockup](docs/design/hush-panel-mockup.png)

> **Status:** early development. The repository is scaffolded and the telemetry engine is being built.

## Why

Most OpenCode telemetry plugins show every metric all the time. Hush flips that: it stays quiet while everything is healthy and surfaces a metric only when it becomes relevant — context filling up, budget burning, plan quota running low.

## Planned

- Adaptive visibility: thresholds decide what is shown, priorities decide what survives a narrow terminal
- Context window gauge with token count and percentage, color-coded by pressure
- Token breakdown (input / output / cached) and session cost
- Streaming speed in tokens per second
- MCP server connection status
- Subagent rollup: per-agent tokens, cost and rate
- Session elapsed time and reasoning status
- OpenCode Go plan usage with estimated time remaining
- Compact one-line footer summary

## Development

Requires Node.js 20+ and pnpm.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Load the plugin during development by adding it to the `plugins` array in `~/.config/opencode/cli.json`.

## Structure

```
src/
  tui.tsx        TUI entrypoint: registers slots, commands and listeners
  core/          Pure, testable logic (formatting, thresholds, metrics)
test/            Vitest unit tests
scripts/         Build helpers
docs/design/     Design references
```

## License

MIT
