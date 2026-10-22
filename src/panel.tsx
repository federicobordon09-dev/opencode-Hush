/**
 * Panel presentation.
 *
 * Render-only: every value comes from `telemetry.ts`, every string from
 * `core/format.ts`. Nothing here computes a metric or invents one — a missing
 * value drops its row, and a section with no data renders nothing at all.
 *
 * Visual rules, from the design reference:
 * - Compact single-line rows, no cards, borders, or decorative elements.
 * - Theme tokens only, never hardcoded colors. The single permitted fallback is
 *   `accentColor`: when a host theme lacks the semantic accent hue, the accent
 *   degrades to `theme.text.base` instead of a hex literal.
 * - Values read in the theme's primary ink (`text.base`), labels in its
 *   secondary ink (`text.muted`), purely decorative strokes in `text.faint`.
 *   The accent (`hue.accent[200]`) is the hue the host itself uses for the
 *   prompt, and the `[200]` step sits at the ink end in both theme modes, so it
 *   reads on light and dark backgrounds alike.
 * - The Context bar is drawn from border glyphs, never from cell backgrounds:
 *   background fills render as a solid block and stay at fixed contrast,
 *   regardless of the theme's surface colors.
 * - State is never conveyed by color alone: dots and glyphs differ per state and
 *   the status word is spelled out next to the ones that matter.
 * - No duplicated host data: MCP, subagents and the prompt footer already live
 *   in OpenCode, so Hush adds only what the host does not show.
 * - Each secondary metric carries a colored dot next to its label, so the eye can
 *   find the row without reading it first.
 */

import { For, Show, createMemo, type Accessor, type JSX } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"

import { barFill } from "./core/bar.ts"
import { formatCost, formatDuration, formatLimit, formatTokens } from "./core/format.ts"
import {
  SUBAGENT_TEXT_WIDTH,
  ellipsize,
  subagentDurationMs,
  subagentsView,
  type SubagentRow,
  type SubagentState,
  type SubagentsView,
} from "./core/subagents.ts"
import type { Pressure } from "./core/usage.ts"
import { createTelemetry } from "./telemetry.ts"

type Context = Plugin.Context
type Theme = Context["theme"]
type Color = Theme["text"]["base"]

/** Width of the label column in the summary block. Fits a dot plus the longest label. */
const LABEL_WIDTH = 12

/**
 * One accent hue for the whole panel: the semantic accent at step 200, the step
 * the host itself paints the prompt with, which stays readable in both theme
 * modes because hue ramps invert per mode. Fallback (single, documented): when
 * a host theme omits the semantic accent hue, the strongest ink takes over —
 * no hex literal is introduced.
 */
function accentColor(theme: Theme): Color {
  return theme.hue.accent?.[200] ?? theme.text.base
}

export function HushPanel(props: { readonly context: Context; readonly sessionID: string }) {
  const context = props.context
  const theme = context.theme
  const view = createTelemetry(context, () => props.sessionID)

  const ratio = () => view.usage()?.ratio
  const contextColor = () =>
    ratio() === undefined ? theme.text.faint : pressureColor(theme, view.pressure())
  const limitText = () => formatLimit(view.usage()?.limit)
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
  const subagentView = createMemo(() => subagentsView(view.subagents()))
  const empty = () =>
    view.subagents().length === 0 &&
    ratio() === undefined &&
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
  }) => (
    <box flexDirection="row" gap={1}>
      <box width={LABEL_WIDTH} flexShrink={0} flexDirection="row">
        <text fg={row.color}>{"● "}</text>
        <text fg={theme.text.muted} wrapMode="none">
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
        {/* The host already labels this block and shows the exact token count
            and percentage; Hush adds only what it does not draw: the pressure
            dot, the compact usage bar and the window limit. */}
        <Show when={ratio()}>
          {(value) => (
            <box marginTop={1} flexDirection="row" gap={1}>
              <text fg={contextColor()} flexShrink={0}>{"● "}</text>
              <box flexGrow={1} minWidth={0}>
                <Bar theme={theme} ratio={value()} accent={accentColor(theme)} />
              </box>
              <Show when={limitText()}>
                {(text) => <text fg={theme.text.muted}>{text()}</text>}
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
                <text fg={theme.text.base} wrapMode="none" truncate>
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
                  <text fg={theme.text.base}>{value()}</text>
                </Row>
              )}
            </Show>
            <Show when={cachedText()}>
              {(value) => (
                <Row label="Cached" color={dot.cached}>
                  <text fg={theme.text.base}>{value()}</text>
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
                  <text fg={theme.text.base}>{value()}</text>
                </Row>
              )}
            </Show>
          </box>
        </Show>

        <Show when={subagentView().summary.total > 0}>
          <SubagentsSection theme={theme} view={subagentView()} now={view.now} />
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

function Bar(props: { readonly theme: Theme; readonly ratio: number; readonly accent: Color }) {
  const fill = barFill(props.ratio)
  return (
    <box flexDirection="row" width="100%" height={1}>
      <box
        height={1}
        width={fill.width}
        minWidth={fill.minWidth}
        border={["top"]}
        borderColor={props.accent}
      />
      <box height={1} flexGrow={1} border={["top"]} borderColor={props.theme.text.faint} />
    </box>
  )
}

function pressureColor(theme: Theme, pressure: Pressure): Color {
  if (pressure === "critical") return theme.text.feedback.error.base
  if (pressure === "warn") return theme.text.feedback.warning.base
  return theme.text.feedback.success.base
}

/**
 * The feedback hues the host itself uses to flag states: its own warning color
 * says "still working", its success and error colors say how a run ended. A
 * subagent that neither runs nor finished gets the muted ink, not a guess.
 */
function subagentStateColor(theme: Theme, state: SubagentState): Color {
  switch (state) {
    case "running":
      return theme.text.feedback.warning.base
    case "done":
      return theme.text.feedback.success.base
    case "error":
      return theme.text.feedback.error.base
    case "stopped":
      return theme.text.muted
  }
}

/**
 * The Subagents section: one compact entry per subagent the session launched,
 * running ones first. The header carries the total on the left and the state
 * tally on the right; zero tallies drop out so only live information prints.
 */
function SubagentsSection(props: {
  readonly theme: Theme
  readonly view: SubagentsView
  readonly now: Accessor<number>
}) {
  const theme = props.theme

  /** Right-hand tally, in state colors, zero buckets omitted. */
  const segments = (): JSX.Element[] => {
    const parts: JSX.Element[] = []
    const push = (count: number, label: string, color: Color) => {
      if (count <= 0) return
      if (parts.length > 0) parts.push(<text fg={theme.text.faint}>{" · "}</text>)
      parts.push(<text fg={color}>{`${count} ${label}`}</text>)
    }
    const summary = props.view.summary
    push(summary.running, "run", subagentStateColor(theme, "running"))
    push(summary.done, "done", subagentStateColor(theme, "done"))
    push(summary.error, "err", subagentStateColor(theme, "error"))
    push(summary.stopped, "stopped", subagentStateColor(theme, "stopped"))
    return parts
  }

  return (
    <box flexDirection="column" marginTop={1}>
      <Divider theme={theme} />
      <box flexDirection="row" gap={1}>
        <text fg={theme.text.muted}>Subagents</text>
        <text fg={theme.text.base}>{String(props.view.summary.total)}</text>
        <box flexGrow={1} />
        <box flexDirection="row" flexShrink={0}>{segments()}</box>
      </box>
      <For each={props.view.rows}>
        {(row) => <SubagentEntry theme={theme} row={row} now={props.now} />}
      </For>
      <Show when={props.view.summary.overflow > 0}>
        <text fg={theme.text.faint}>{`+${props.view.summary.overflow} more`}</text>
      </Show>
    </box>
  )
}

/**
 * One subagent: state dot, agent name, model to the right, then the task text
 * and the elapsed-time-and-tokens line in the faint ink. Every line carries a
 * layout truncation as backstop; the description is pre-cut by the core to the
 * design width so the ellipsis is ours, not the layout's.
 */
function SubagentEntry(props: {
  readonly theme: Theme
  readonly row: SubagentRow
  readonly now: Accessor<number>
}) {
  const theme = props.theme
  const color = () => subagentStateColor(theme, props.row.state)
  const descriptionText = () => {
    const text = props.row.description
    return text === undefined ? undefined : ellipsize(text, SUBAGENT_TEXT_WIDTH)
  }
  const metaText = () => {
    const parts: string[] = []
    const duration = subagentDurationMs(props.row, props.now())
    if (duration !== undefined) parts.push(formatDuration(duration))
    if (props.row.tokens !== undefined && props.row.tokens > 0) parts.push(`${formatTokens(props.row.tokens)} tok`)
    return parts.length === 0 ? undefined : parts.join(" · ")
  }
  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        <text fg={color()}>{"● "}</text>
        <box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="row">
          <text fg={theme.text.base} wrapMode="none" truncate flexShrink={1} minWidth={0}>
            {props.row.name}
          </text>
        </box>
        <Show when={props.row.model !== undefined}>
          {(model) => <text fg={theme.text.muted} flexShrink={0}>{model()}</text>}
        </Show>
      </box>
      <Show when={descriptionText()}>
        {(text) => (
          <text fg={theme.text.faint} wrapMode="none" truncate>
            {`  ${text()}`}
          </text>
        )}
      </Show>
      <Show when={metaText()}>
        {(text) => (
          <text fg={theme.text.faint} wrapMode="none" truncate>
            {`  ${text()}`}
          </text>
        )}
      </Show>
    </box>
  )
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
