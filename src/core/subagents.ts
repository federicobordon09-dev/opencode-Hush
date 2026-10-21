/**
 * Subagent rows for the sidebar section.
 *
 * Pure mapping from host data to display rows: states, ordering, the summary
 * counters and truncation. It knows nothing about the host store or Solid —
 * the telemetry layer feeds it plain snapshots and the panel renders its rows
 * as-is, so the whole module is testable without a host.
 *
 * Field semantics come from the host types, not guesses:
 * - A subagent is a session in the family tree that has a `parentID`
 *   (`SessionInfo.parentID`, @opencode/client types.d.ts:2895).
 * - Live state is the host's own condensed `session.status(id)`
 *   ("idle" | "running", @opencode/plugin tui context.d.ts:44); the terminal
 *   state is the session's `outcome` ("succeeded" | "failed" | "interrupted",
 *   types.d.ts:2905). Running wins over outcome: an interrupted session the
 *   host resumed reports running again.
 * - Duration end is `time.idle ?? time.updated` (types.d.ts:2909/2908), the
 *   same semantics the reference TUI plugin uses to stop the clock when a
 *   subagent finishes.
 */

/** The four states a subagent row can show. */
export type SubagentState = "running" | "done" | "error" | "stopped"

/**
 * What the telemetry layer extracted from the host for one subagent session.
 * Every field is optional except the id: a missing datum drops its piece of
 * the row instead of forcing an estimate.
 */
export type SubagentSnapshot = {
  readonly id: string
  /** Resolved agent display name from the host catalog, when the lookup worked. */
  readonly agentName?: string
  /** Raw agent type id the session reports (`SessionInfo.agent`). */
  readonly agent?: string
  /** Display name of the session's model, when it resolved to something. */
  readonly model?: string
  /** The task text the host assigned to the session (`SessionInfo.title`). */
  readonly title?: string
  /** Live host state for the session, already condensed by the host. */
  readonly status: "idle" | "running"
  /** Terminal outcome, present only once the session finished. */
  readonly outcome?: "succeeded" | "failed" | "interrupted"
  /** Tokens this session processed, on Hush's processed basis. */
  readonly tokens?: number
  /** `time.created` in ms, when the host reported it. */
  readonly createdAt?: number
  /** `time.idle ?? time.updated` in ms; absent while the host never set one. */
  readonly endedAt?: number
}

/** One rendered entry in the Subagents section. */
export type SubagentRow = {
  readonly id: string
  readonly state: SubagentState
  readonly name: string
  /** Task text, only when it adds information beyond the name. */
  readonly description?: string
  readonly model?: string
  readonly tokens?: number
  readonly createdAt?: number
  readonly endedAt?: number
}

/** Counters for the section header. */
export type SubagentSummary = {
  readonly total: number
  readonly running: number
  readonly done: number
  readonly error: number
  /** Interrupted or never-finished sessions; shown only when above zero. */
  readonly stopped: number
  /** Rows beyond the display cap, for the "+N more" line. */
  readonly overflow: number
}

export type SubagentsView = {
  readonly rows: readonly SubagentRow[]
  readonly summary: SubagentSummary
}

/** How many entries the section shows before folding the rest into "+N more". */
export const SUBAGENT_ROW_CAP = 6

/**
 * Design width for the description line, in cells. The host does not expose
 * the sidebar slot width to plugins, so this matches the width the reference
 * plugin uses for the same slot (34 columns); the layout's own truncation acts
 * as the backstop on narrower or wider sidebars.
 */
export const SUBAGENT_TEXT_WIDTH = 34

/** Maps host state + outcome onto the four display states. Running wins. */
export function subagentState(snapshot: SubagentSnapshot): SubagentState {
  if (snapshot.status === "running") return "running"
  if (snapshot.outcome === "succeeded") return "done"
  if (snapshot.outcome === "failed") return "error"
  // Interrupted, or idle without a terminal outcome: the session did not
  // complete, and Hush does not invent which way it went.
  return "stopped"
}

/** Collapses any whitespace run into single spaces so a multi-line task renders as one line. */
export function normalizeTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * The name a row leads with: the friendliest real datum available, in order —
 * catalog display name, raw agent type, then the task text itself. An empty
 * string means the host gave no name at all.
 */
export function subagentName(snapshot: SubagentSnapshot): string {
  const catalog = snapshot.agentName?.trim()
  if (catalog !== undefined && catalog.length > 0) return catalog
  const agent = snapshot.agent?.trim()
  if (agent !== undefined && agent.length > 0) return agent
  const title = snapshot.title === undefined ? undefined : normalizeTitle(snapshot.title)
  return title ?? ""
}

/**
 * The task text under the name — only when it actually adds information.
 * A title that repeats the name (the common host shape) would print twice.
 */
export function subagentDescription(snapshot: SubagentSnapshot, name: string): string | undefined {
  const title = snapshot.title === undefined ? undefined : normalizeTitle(snapshot.title)
  if (title === undefined || title.length === 0) return undefined
  if (title.toLowerCase() === name.toLowerCase()) return undefined
  return title
}

/** Cuts text to `maxWidth` cells with an ellipsis; text that fits comes back untouched. */
export function ellipsize(text: string, maxWidth: number): string {
  if (maxWidth < 1) return ""
  const chars = Array.from(text)
  if (chars.length <= maxWidth) return text
  return chars.slice(0, maxWidth - 1).join("") + "…"
}

/**
 * Duration in milliseconds for a row, against the shared panel clock. Running
 * rows tick with `now`; finished rows freeze at their end time, so a done or
 * errored subagent never changes again. Undefined when the host did not report
 * the timestamps the subtraction needs — never an estimate.
 */
export function subagentDurationMs(row: SubagentRow, now: number): number | undefined {
  const created = row.createdAt
  if (created === undefined || !Number.isFinite(created) || created <= 0) return undefined
  const end = row.state === "running" ? now : row.endedAt
  if (end === undefined || !Number.isFinite(end)) return undefined
  return Math.max(0, end - created)
}

/**
 * Builds everything the section renders: one row per snapshot, running rows
 * first, then by most recent start; capped at `SUBAGENT_ROW_CAP` with the rest
 * counted as overflow. Summary counters cover every subagent, not just the
 * visible ones.
 */
export function subagentsView(
  snapshots: readonly SubagentSnapshot[],
  cap: number = SUBAGENT_ROW_CAP,
): SubagentsView {
  const rows: SubagentRow[] = snapshots.map((snapshot) => {
    const state = subagentState(snapshot)
    const name = subagentName(snapshot)
    return {
      id: snapshot.id,
      state,
      name,
      description: subagentDescription(snapshot, name),
      model: snapshot.model,
      tokens: snapshot.tokens !== undefined && snapshot.tokens > 0 ? snapshot.tokens : undefined,
      createdAt: snapshot.createdAt,
      endedAt: snapshot.endedAt,
    }
  })

  rows.sort((a, b) => {
    const rank = (row: SubagentRow) => (row.state === "running" ? 0 : 1)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return (b.createdAt ?? 0) - (a.createdAt ?? 0)
  })

  const counts = { running: 0, done: 0, error: 0, stopped: 0 }
  for (const row of rows) {
    if (row.state === "running") counts.running += 1
    else if (row.state === "done") counts.done += 1
    else if (row.state === "error") counts.error += 1
    else counts.stopped += 1
  }

  const summary: SubagentSummary = {
    total: rows.length,
    running: counts.running,
    done: counts.done,
    error: counts.error,
    stopped: counts.stopped,
    overflow: Math.max(0, rows.length - cap),
  }

  return { rows: rows.slice(0, cap), summary }
}
