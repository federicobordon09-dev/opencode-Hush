/**
 * Subagent derivation.
 *
 * OpenCode models a delegated task as a child session: `parentID` points at the
 * session that spawned it and the whole tree shares a family. Hush reads that
 * tree, never a private registry, so the rows always match what the host knows.
 *
 * The session data a caller passes in is already snapshotted by the host, which
 * makes every derivation here idempotent: repeated events rewrite the same
 * values instead of accumulating anything.
 */

import { totalTokens, type TokenUsageView } from "./usage.ts"

/** The fields Hush reads from a session to describe it as an agent. The host's `SessionInfo` satisfies it. */
export type AgentSessionView = {
  readonly id: string
  readonly parentID?: string
  readonly title?: string
  readonly agent?: string
  readonly model?: { readonly id: string; readonly providerID: string }
  readonly cost: number
  readonly tokens: TokenUsageView
  readonly outcome?: "succeeded" | "failed" | "interrupted"
  readonly time?: { readonly created?: number; readonly updated?: number }
}

/** `running` comes from the host's session status, never from a guess about the last event. */
export type AgentState = "running" | "idle"

export type AgentRow = {
  readonly id: string
  /** Short label for the row: the session title, else the agent name, else a short id. */
  readonly label: string
  /** Agent name the host assigned, when it did. */
  readonly agent?: string
  readonly state: AgentState
  readonly outcome?: "succeeded" | "failed" | "interrupted"
  readonly model?: { readonly id: string; readonly providerID: string }
  readonly cost: number
  readonly tokens: number
}

export type AgentSummary = {
  readonly total: number
  readonly active: number
  /** Ended without error and without an interrupt. */
  readonly done: number
  readonly failed: number
  readonly interrupted: number
}

export type AgentInput = {
  readonly sessions: readonly AgentSessionView[]
  readonly rootID: string
  /** Session ids the host groups under `rootID`; children missing from it are still picked up by `parentID`. */
  readonly family: readonly string[]
  readonly statusOf: (sessionID: string) => AgentState
}

/**
 * Rows for every session in the root's tree except the root itself. A session
 * that appears both in the family list and as a child of a family member is
 * counted once.
 */
export function deriveAgentRows(input: AgentInput): AgentRow[] {
  const known = new Set(input.family)
  known.add(input.rootID)

  const rows: Array<{ readonly row: AgentRow; readonly since: number }> = []
  const seen = new Set<string>()

  for (const session of input.sessions) {
    if (session.id === input.rootID || seen.has(session.id)) continue
    const inFamily = known.has(session.id)
    const childOfFamily = session.parentID !== undefined && known.has(session.parentID)
    if (!inFamily && !childOfFamily) continue
    seen.add(session.id)

    rows.push({
      since: session.time?.updated ?? session.time?.created ?? 0,
      row: {
        id: session.id,
        label: label(session),
        agent: session.agent,
        state: input.statusOf(session.id),
        outcome: session.outcome,
        model: session.model === undefined ? undefined : { id: session.model.id, providerID: session.model.providerID },
        cost: Number.isFinite(session.cost) && session.cost > 0 ? session.cost : 0,
        tokens: usableTokens(session.tokens),
      },
    })
  }

  return rows
    .sort((left, right) => {
      if (left.row.state !== right.row.state) return left.row.state === "running" ? -1 : 1
      if (left.since !== right.since) return right.since - left.since
      return left.row.id < right.row.id ? -1 : left.row.id > right.row.id ? 1 : 0
    })
    .map((entry) => entry.row)
}

function label(session: AgentSessionView): string {
  const title = session.title?.trim()
  if (title !== undefined && title.length > 0) return title
  if (session.agent !== undefined && session.agent.length > 0) return session.agent
  return session.id.slice(0, 7)
}

/** A token counter that the host has not filled in yet is unknown, not negative. */
function usableTokens(tokens: TokenUsageView): number {
  const total = totalTokens(tokens)
  return Number.isFinite(total) && total > 0 ? total : 0
}

/** Counts rows by outcome. An agent lands in exactly one bucket, so the summary always adds up. */
export function summarizeAgents(rows: readonly AgentRow[]): AgentSummary {
  let active = 0
  let done = 0
  let failed = 0
  let interrupted = 0
  for (const row of rows) {
    if (row.state === "running") active += 1
    else if (row.outcome === "failed") failed += 1
    else if (row.outcome === "interrupted") interrupted += 1
    else if (row.outcome === "succeeded") done += 1
  }
  return { total: rows.length, active, done, failed, interrupted }
}
