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
 * - No duplicated host data: MCP, subagents and the prompt footer already live
 *   in OpenCode, so Hush adds only what the host does not show.
 * - Each secondary metric carries a colored dot next to its label, so the eye can
 *   find the row without reading it first.
 */

import { Show, type JSX } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"

import { formatCost, formatDuration, formatTokens } from "./core/format.ts"
import type { Pressure } from "./core/usage.ts"
import { createTelemetry } from "./telemetry.ts"

type Context = Plugin.Context
type Theme = Context["theme"]
type Color = Theme["text"]["base"]

/** Width of the label column in the summary block. Fits a dot plus the longest label. */
const LABEL_WIDTH = 12

export function HushPanel(props: { readonly context: Context; readonly sessionID: string }) {
  const context = props.context
  const theme = context.theme
  const view = createTelemetry(context, () => props.sessionID)

  const used = () => view.usage()?.used
  const ratio = () => view.usage()?.ratio
  const contextColor = () =>
    ratio() === undefined ? theme.text.faint : pressureColor(theme, view.pressure())
  const limitText = () => {
    const limit = view.usage()?.limit
    return limit === undefined ? undefined : ` / ${formatTokens(limit)}`
  }
  const modelText = () => view.modelName(view.modelRef())
  const elapsedText = () => {
    const value = view.elapsed()
    return value === undefined ? undefined : formatDuration(value)
  }
  const tokensText = () => {
    const value = view.sessionTokens()
    return value > 0 ? `${formatTokens(value)} tok` : undefined
  }
  const cachedText = () => {
    const value = view.cachedTokens()
    return value > 0 ? `${formatTokens(value)} tok` : undefined
  }
  const costText = () => {
    const value = view.cost()
    return value > 0 ? formatCost(value) : undefined
  }
  const reasoningText = () => (view.reasoning() ? "active" : undefined)
  const empty = () =>
    used() === undefined &&
    view.branch() === undefined &&
    modelText() === undefined &&
    costText() === undefined &&
    tokensText() === undefined &&
    cachedText() === undefined &&
    elapsedText() === undefined &&
    reasoningText() === undefined

  /** One hue per metric. The last three are shades of the first two, so every row stays distinct. */
  const dot = {
    model: categoricalColor(theme, 0),
    cost: categoricalColor(theme, 3),
    tokens: categoricalColor(theme, 1),
    cached: theme.decrease(categoricalColor(theme, 1), 2),
    elapsed: theme.increase(categoricalColor(theme, 0), 2),
    reasoning: theme.increase(categoricalColor(theme, 1), 2),
  }

  /**
   * The label column keeps its width; the value column shrinks so a long model
   * name truncates instead of pushing the row past the sidebar. The one-cell gap
   * keeps the label readable even when the value is at its narrowest.
   */
  const Row = (row: {
    readonly label: string
    readonly color: Color
    readonly children: JSX.Element
    /** Secondary rows step back one tone so the primary metrics stay readable. */
    readonly dim?: boolean
  }) => (
    <box flexDirection="row" gap={1}>
      <box width={LABEL_WIDTH} flexShrink={0} flexDirection="row">
        <text fg={row.color}>{"● "}</text>
        <text fg={row.dim ? theme.text.faint : theme.text.muted} wrapMode="none">
          {row.label}
        </text>
      </box>
      <box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="row" justifyContent="flex-end">
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
                <text fg={contextColor()}>{"● "}</text>
                <text fg={theme.text.muted}>Context</text>
              </box>
              <box flexDirection="row">
                <text fg={theme.text.base}>{formatTokens(value())}</text>
                <Show when={limitText()}>
                  {(text) => <text fg={theme.text.faint}>{text()}</text>}
                </Show>
                <text fg={theme.text.faint}> tokens</text>
              </box>
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

        <Show when={modelText() !== undefined || costText() !== undefined || tokensText() !== undefined || cachedText() !== undefined}>
          <box flexDirection="column" marginTop={1}>
            <Divider theme={theme} />
            <Show when={modelText()}>
              {(value) => (
                <Row label="Model" color={dot.model}>
                  <text fg={theme.text.base} wrapMode="none" truncate flexShrink={1} minWidth={0}>
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
            <Show when={tokensText()}>
              {(value) => (
                <Row label="Tokens" color={dot.tokens}>
                  <text fg={theme.text.muted}>{value()}</text>
                </Row>
              )}
            </Show>
            <Show when={cachedText()}>
              {(value) => (
                <Row label="Cached" color={dot.cached} dim>
                  <text fg={theme.text.faint}>{value()}</text>
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
                <Row label="Elapsed" color={dot.elapsed}>
                  <text fg={theme.text.base}>{value()}</text>
                </Row>
              )}
            </Show>
            <Show when={reasoningText()}>
              {(value) => (
                <Row label="Reasoning" color={dot.reasoning}>
                  <text fg={theme.text.feedback.info.base}>{value()}</text>
                </Row>
              )}
            </Show>
          </box>
        </Show>
      </Show>

      <Show when={view.degraded()}>
        <text fg={theme.text.feedback.warning.base}>{"! partial data"}</text>
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
