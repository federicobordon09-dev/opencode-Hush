/**
 * Session awareness derived only from OpenCode 2.1 session snapshots/events.
 *
 * Keep the host run state separate from attention, tool activity and errors:
 * those are additional facts, not replacement session statuses.
 */

export type SessionRunState = "running" | "idle"

export type AwarenessMessage = {
  readonly type: string
  readonly outcome?: string
  readonly error?: unknown
  readonly content?: readonly unknown[]
  readonly time?: { readonly created?: number }
}

export type ActiveTool = {
  readonly name: string
  readonly count: number
  readonly createdAt?: number
}

export type RecentExecutionError = {
  readonly message?: string
  readonly createdAt?: number
}

export type ExecutionEvent = {
  readonly type: string
  readonly created: number
  readonly data: { readonly sessionID: string; readonly error?: unknown }
}

/** Only tool parts whose host state is exactly `running` count as active. */
export function activeTools(messages: readonly AwarenessMessage[]): ActiveTool[] {
  const active: Array<{ name: string; createdAt?: number }> = []
  for (const message of messages) {
    if (message.type !== "assistant" || !Array.isArray(message.content)) continue
    for (const raw of message.content) {
      if (!isRecord(raw) || raw.type !== "tool" || !isRecord(raw.state) || raw.state.status !== "running") continue
      if (typeof raw.name !== "string" || raw.name.trim().length === 0) continue
      const createdAt = isRecord(raw.time) && isFiniteNumber(raw.time.created) ? raw.time.created : undefined
      active.push({ name: raw.name.trim(), createdAt })
    }
  }

  active.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  const grouped = new Map<string, ActiveTool>()
  for (const tool of active) {
    const previous = grouped.get(tool.name)
    grouped.set(tool.name, {
      name: tool.name,
      count: (previous?.count ?? 0) + 1,
      createdAt: Math.max(previous?.createdAt ?? 0, tool.createdAt ?? 0) || undefined,
    })
  }
  return [...grouped.values()]
}

/**
 * Restores the last failed execution from terminal idle messages. A newer
 * user/synthetic/shell message supersedes that old failure, even if its next
 * execution has not started yet.
 */
export function recentExecutionError(messages: readonly AwarenessMessage[]): RecentExecutionError | undefined {
  let latest: RecentExecutionError | undefined
  for (const message of messages) {
    if (message.type === "idle") {
      latest = message.outcome === "failed"
        ? { message: errorMessage(message.error), createdAt: validTime(message.time?.created) }
        : undefined
      continue
    }
    if (latest !== undefined && (message.type === "user" || message.type === "synthetic" || message.type === "shell")) {
      latest = undefined
    }
  }
  return latest
}

/** Formats only names OpenCode explicitly marked as running. */
export function formatActiveTools(tools: readonly ActiveTool[]): string | undefined {
  if (tools.length === 0) return undefined
  const visible = tools.slice(0, 2).map((tool) => tool.count > 1 ? `${tool.name} ×${tool.count}` : tool.name)
  const hidden = tools.length - visible.length
  return hidden > 0 ? `${visible.join(", ")} +${hidden}` : visible.join(", ")
}

/** Event-backed recent error state, scoped to the selected session. */
export function createExecutionErrorTracker() {
  let sessionID: string | undefined
  let latestCreated = -Infinity
  let error: RecentExecutionError | undefined

  return {
    activate(id: string | undefined) {
      if (id === sessionID) return
      sessionID = id
      latestCreated = -Infinity
      error = undefined
    },
    hydrate(id: string, snapshot: RecentExecutionError | undefined) {
      if (id !== sessionID || latestCreated !== -Infinity) return
      error = snapshot
      latestCreated = snapshot?.createdAt ?? -Infinity
    },
    apply(event: ExecutionEvent, selectedSessionID: string | undefined) {
      if (event.data.sessionID !== sessionID || sessionID !== selectedSessionID) return
      if (!isFiniteNumber(event.created) || event.created < latestCreated) return
      latestCreated = event.created
      if (event.type === "session.execution.failed") {
        error = { message: errorMessage(event.data.error), createdAt: event.created }
      } else if (
        event.type === "session.execution.started" ||
        event.type === "session.execution.succeeded" ||
        event.type === "session.execution.interrupted" ||
        event.type === "session.deleted"
      ) {
        error = undefined
      }
    },
    current(id: string | undefined): RecentExecutionError | undefined {
      return id === sessionID ? error : undefined
    },
  }
}

function errorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const message = value.message
  if (typeof message !== "string") return undefined
  const normalized = message.replace(/\s+/g, " ").trim()
  return normalized.length > 0 ? normalized : undefined
}

function validTime(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
