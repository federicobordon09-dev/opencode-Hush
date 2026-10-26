# Hush

Minimal telemetry for the [OpenCode](https://opencode.ai) TUI: context window pressure, the Git branch, and the session metrics the host does not draw. Quiet while everything is healthy, specific when something needs attention.

> 🇪🇸 [Leer en español](./README.es.md)

## Install

```sh
opencode plugin add opencode-hush
```

Restart OpenCode afterwards. The first load can take close to a minute while the host fetches and precompiles the plugin.

<table>
  <tr>
    <td align="center"><img src="https://raw.githubusercontent.com/federicobordon09-dev/opencode-Hush/main/docs/design/hush-tema-claro.png" alt="Hush sidebar panel on a light OpenCode theme" /></td>
    <td align="center"><img src="https://raw.githubusercontent.com/federicobordon09-dev/opencode-Hush/main/docs/design/hush-tema-oscuro.png" alt="Hush sidebar panel on a dark OpenCode theme" /></td>
  </tr>
</table>

## What it shows

- **Context** — pressure bar and model limit (from the last assistant message carrying usage; limit from `ModelInfo.limit.context`).
- **Git** — current branch (`data.location.vcs.info()`). Only shown when OpenCode runs inside a git repository.
- **Meta** — model, family cost, family tokens, cached tokens, elapsed time, active reasoning.

Sections with no data render nothing. Every figure comes from the plugin context — nothing is estimated or fetched from outside the local runtime.

## Commands

- **Check for updates** — `Hush: check for updates` in the command palette, or `/hush-update` in the prompt. Hush asks the host's plugin API whether npm has a newer release and, on confirmation, installs it. Restart OpenCode to load the new code.

## Requirements

- Node.js 22.18+
- OpenCode 2.1.x

## Development

```sh
pnpm install
pnpm test
pnpm build
pnpm verify:pack
```

## License

MIT, copyright © 2026 Federico Bordón.