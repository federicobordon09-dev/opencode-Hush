/**
 * Panel presentation.
 *
 * Render-only: every value comes from `telemetry.ts`, every string from
 * `core/format.ts`. Nothing here computes a metric or invents one — a missing
 * value drops its row, and a section with no data renders nothing at all.
 *
 * Visual rules, from the design reference:
 * - Compact single-line rows, no cards, borders, or decorative elements.
 * - Theme tokens only, never hardcoded colors.
 * - State is never conveyed by color alone: dots and glyphs differ per state and
 *   the status word is spelled out next to the ones that matter.
 * - No duplicated host data: MCP and the prompt footer already live in OpenCode,
 *   so Hush adds only what the host does not show.
 * - Each secondary metric carries a colored dot next to its label, so the eye can
 *   find the row without reading it first.
 * - Per-agent tokens and cost stay on the row; only the model moves to a second
 *   line when the terminal is wide enough.
 */

import { For, Show, createSignal, onCleanup, type Accessor, type JSX } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"

import type { AgentRow, AgentSummary } from "./core/agents.ts"
import { formatCost, formatDuration, formatPercent, formatRate, formatTokens } from "./core/format.ts"
import type { Pressure } from "./core/usage.ts"
import { createTelemetry } from "./telemetry.ts"

type Context = Plugin.Context
type Theme = Context["theme"]
type Color = Theme["text"]["base"]

/** Width of the label column in the summary block. Fits a dot plus the longest label. */
const LABEL_WIDTH = 12

/**
 * Terminal width at which Hush starts spending space on secondary detail. The
 * sidebar is a fraction of the surface, so a narrow terminal means a narrow
 * panel; below this only the primary metrics are rendered.
 */
const DETAIL_WIDTH = 90

export function HushPanel(props: { readonly context: Context; readonly sessionID: string }) {
  const context = props.context
  const theme = context.theme
  const view = createTelemetry(context, () => props.sessionID)
  const detail = createDetail(context)

  const used = () => view.usage()?.used
  const ratio = () => view.usage()?.ratio
  const limitText = () => {
    const limit = view.usage()?.limit
    return limit === undefined ? undefined : ` / ${formatTokens(limit)}`
  }
  const percentText = () => {
    const value = ratio()
    return value === undefined ? undefined : formatPercent(value)
  }
  const modelText = () => view.modelName(view.modelRef())
  const elapsedText = () => {
    const value = view.elapsed()
    return value === undefined ? undefined : formatDuration(value)
  }
  const rateText = () => {
    const value = view.rate()
    return value === undefined ? undefined : formatRate(value)
  }
  const tokensText = () => {
    const value = view.sessionTokens()
    return value > 0 ? `${formatTokens(value)} tok` : undefined
  }
  const costText = () => {
    const value = view.cost()
    return value > 0 ? formatCost(value) : undefined
  }
  const reasoningText = () => {
    if (view.reasoning()) return "active"
    if (view.reasoningSupported() === true) return "supported"
    return undefined
  }
  const empty = () =>
    used() === undefined &&
    view.agents().length === 0 &&
    view.branch() === undefined &&
    modelText() === undefined

  /** One hue per metric. The last two are shades of the first two, so six rows stay distinct. */
  const dot = {
    model: categoricalColor(theme, 0),
    cost: categoricalColor(theme, 3),
    rate: categoricalColor(theme, 2),
    tokens: categoricalColor(theme, 1),
    session: theme.increase(categoricalColor(theme, 0), 2),
    reasoning: theme.increase(categoricalColor(theme, 1), 2),
  }

  /** The part of an agent row that only fits on wide terminals. */
  const agentModel = (row: AgentRow): string | undefined => {
    const parts: string[] = []
    if (row.agent !== undefined && row.agent !== row.label) parts.push(row.agent)
    const name = view.modelName(row.model)
    if (name !== undefined) parts.push(name)
    return parts.length > 0 ? parts.join(" · ") : undefined
  }

  const Row = (row: { readonly label: string; readonly color: Color; readonly children: JSX.Element }) => (
    <box flexDirection="row">
      <box width={LABEL_WIDTH} flexDirection="row">
        <text fg={row.color}>{"● "}</text>
        <text fg={theme.text.muted} wrapMode="none">
          {row.label}
        </text>
      </box>
      <box flexGrow={1} flexDirection="row" justifyContent="flex-end">
        {row.children}
      </box>
    </box>
  )

  return (
    <box flexDirection="column">
      <Show when={!empty()} fallback={<text fg={theme.text.faint}>hush</text>}>
        <Show when={used()}>
          {(value) => (
            <box flexDirection="column" marginTop={1}>
              <box flexDirection="row">
                <text fg={pressureColor(theme, view.pressure())}>{"● "}</text>
                <text fg={theme.text.muted}>Context</text>
              </box>
              <box flexDirection="row">
                <text fg={theme.text.base}>{formatTokens(value())}</text>
                <Show when={limitText()}>
                  {(text) => <text fg={theme.text.faint}>{text()}</text>}
                </Show>
                <text fg={theme.text.faint}> tokens</text>
              </box>
              <Show when={percentText()}>
                {(text) => (
                  <box flexDirection="row">
                    <text fg={pressureColor(theme, view.pressure())}>{text()}</text>
                    <text fg={theme.text.muted}> used</text>
                  </box>
                )}
              </Show>
              <Show when={ratio()}>
                {(value) => (
                  <Bar theme={theme} ratio={value()} color={pressureColor(theme, view.pressure())} />
                )}
              </Show>
            </box>
          )}
        </Show>

        <Show when={view.branch()}>
          {(branch) => (
            <box flexDirection="column" marginTop={1}>
              <text fg={theme.text.muted}>Git</text>
              <box flexDirection="row">
                <text fg={theme.text.feedback.success.base}>{"● "}</text>
                <text fg={theme.text.feedback.success.base} wrapMode="none" truncate>
                  {branch()}
                </text>
              </box>
            </box>
          )}
        </Show>

        <Show when={view.agents().length > 0}>
          <box flexDirection="column" marginTop={1}>
            <text fg={theme.text.muted}>{`Agents (${view.agentSummary().total})`}</text>
            <box flexDirection="row">
              <For each={summaryParts(view.agentSummary())}>
                {(part, index) => (
                  <box flexDirection="row">
                    <Show when={index() > 0}>
                      <text fg={theme.text.faint}>{" · "}</text>
                    </Show>
                    <text fg={summaryColor(theme, part.tone)}>{`${part.glyph} `}</text>
                    <text fg={theme.text.muted}>{part.label}</text>
                  </box>
                )}
              </For>
            </box>
            <For each={view.agents()}>
              {(row) => (
                <box flexDirection="column">
                  <box flexDirection="row">
                    <text fg={agentColor(theme, row)}>{`${agentGlyph(row)} `}</text>
                    <box flexGrow={1}>
                      <text fg={row.state === "running" ? theme.text.base : theme.text.muted} wrapMode="none" truncate>
                        {row.label}
                      </text>
                    </box>
                    <Show when={row.tokens > 0}>
                      <text fg={theme.text.faint}>{`${formatTokens(row.tokens)} tok`}</text>
                    </Show>
                    <Show when={row.cost > 0}>
                      <text fg={theme.text.muted}>{`  ${formatCost(row.cost)}`}</text>
                    </Show>
                  </box>
                  <Show when={detail() ? agentModel(row) : undefined}>
                    {(text) => (
                      <box paddingLeft={2}>
                        <text fg={theme.text.faint} wrapMode="none" truncate>
                          {text()}
                        </text>
                      </box>
                    )}
                  </Show>
                </box>
              )}
            </For>
          </box>
        </Show>

        <Show when={modelText() !== undefined || costText() !== undefined || rateText() !== undefined || tokensText() !== undefined}>
          <box flexDirection="column" marginTop={1}>
            <Divider theme={theme} />
            <Show when={modelText()}>
              {(value) => (
                <Row label="Model" color={dot.model}>
                  <text fg={theme.text.base} wrapMode="none" truncate>
                    {value()}
                  </text>
                </Row>
              )}
            </Show>
            <Show when={costText()}>
              {(value) => (
                <Row label="Cost" color={dot.cost}>
                  <text fg={theme.text.base}>{value()}</text>
                </Row>
              )}
            </Show>
            <Show when={rateText()}>
              {(value) => (
                <Row label="Rate" color={dot.rate}>
                  <text fg={theme.text.muted}>{value()}</text>
                </Row>
              )}
            </Show>
            <Show when={tokensText()}>
              {(value) => (
                <Row label="Tokens" color={dot.tokens}>
                  <text fg={theme.text.muted}>{value()}</text>
                </Row>
              )}
            </Show>
          </box>
        </Show>

        <Show when={elapsedText() !== undefined || reasoningText() !== undefined}>
          <box flexDirection="column">
            <Divider theme={theme} />
            <Show when={elapsedText()}>
              {(value) => (
                <Row label="Session" color={dot.session}>
                  <text fg={theme.text.base}>{value()}</text>
                </Row>
              )}
            </Show>
            <Show when={reasoningText()}>
              {(value) => (
                <Row label="Reasoning" color={dot.reasoning}>
                  <text fg={view.reasoning() ? theme.text.feedback.info.base : theme.text.muted}>{value()}</text>
                </Row>
              )}
            </Show>
          </box>
        </Show>

        <Show when={view.degraded()}>
          <text fg={theme.text.feedback.warning.base}>{"! partial data"}</text>
        </Show>
      </Show>
    </box>
  )
}

function Divider(props: { readonly theme: Theme }) {
  return <box height={1} width="100%" border={["top"]} borderColor={props.theme.border.base} />
}

function Bar(props: { readonly theme: Theme; readonly ratio: number; readonly color: Color }) {
  return (
    <box flexDirection="row" height={1} width="100%">
      <box height={1} width={percentWidth(props.ratio)} backgroundColor={props.color} />
      <box height={1} flexGrow={1} backgroundColor={props.theme.background.raised.base} />
    </box>
  )
}

/** A bar narrower than one cell would otherwise vanish or overflow its track. */
function percentWidth(ratio: number): `${number}%` {
  const clamped = Math.min(100, Math.max(0, ratio * 100))
  return `${clamped}%`
}

function pressureColor(theme: Theme, pressure: Pressure): Color {
  if (pressure === "critical") return theme.text.feedback.error.base
  if (pressure === "warn") return theme.text.feedback.warning.base
  return theme.text.feedback.success.base
}

/**
 * Unrelated metrics get unrelated hues. The palette belongs to the host theme;
 * a theme with fewer entries falls back to the muted token instead of repeating
 * a color with a different meaning.
 */
function categoricalColor(theme: Theme, index: number): Color {
  const scale = theme.categorical[index]
  return scale?.[400] ?? theme.text.muted
}

function agentGlyph(row: AgentRow): string {
  if (row.state === "running") return "▶"
  if (row.outcome === "failed") return "✗"
  if (row.outcome === "interrupted") return "⊘"
  if (row.outcome === "succeeded") return "✓"
  return "·"
}

function agentColor(theme: Theme, row: AgentRow): Color {
  if (row.state === "running") return theme.text.feedback.warning.base
  if (row.outcome === "failed") return theme.text.feedback.error.base
  if (row.outcome === "interrupted") return theme.text.feedback.warning.base
  if (row.outcome === "succeeded") return theme.text.feedback.success.base
  return theme.text.faint
}

type SummaryTone = "active" | "done" | "failed" | "stopped"

/**
 * One entry per state worth calling out. The failed count is always present so
 * "nothing broke" is stated rather than inferred from an empty row.
 */
function summaryParts(summary: AgentSummary): Array<{ readonly glyph: string; readonly label: string; readonly tone: SummaryTone }> {
  const parts: Array<{ readonly glyph: string; readonly label: string; readonly tone: SummaryTone }> = []
  if (summary.active > 0) parts.push({ glyph: "●", label: `${summary.active} run`, tone: "active" })
  if (summary.done > 0) parts.push({ glyph: "✓", label: `${summary.done} done`, tone: "done" })
  parts.push({ glyph: "✗", label: `${summary.failed} err`, tone: "failed" })
  if (summary.interrupted > 0) parts.push({ glyph: "⊘", label: `${summary.interrupted} stopped`, tone: "stopped" })
  return parts
}

function summaryColor(theme: Theme, tone: SummaryTone): Color {
  if (tone === "done") return theme.text.feedback.success.base
  if (tone === "failed") return theme.text.feedback.error.base
  return theme.text.feedback.warning.base
}

/** Tracks the render surface width so secondary detail can be dropped on narrow terminals. */
function createDetail(context: Context): Accessor<boolean> {
  const renderer = context.renderer
  const read = () => {
    const width = renderer?.width
    return typeof width === "number" && Number.isFinite(width) ? width : 0
  }
  const [columns, setColumns] = createSignal(read())
  const onResize = () => setColumns(read())

  // A renderer that cannot emit resize events simply keeps the initial width.
  if (typeof renderer?.on === "function") renderer.on("resize", onResize)
  onCleanup(() => {
    if (typeof renderer?.off === "function") renderer.off("resize", onResize)
  })

  return () => columns() >= DETAIL_WIDTH
}
