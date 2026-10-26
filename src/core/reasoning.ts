/**
 * Event-derived reasoning state.
 *
 * OpenCode exposes no reasoning snapshot in the TUI data API; this tracker
 * therefore only makes the durable event stream safe to consume. Older events
 * cannot undo a newer state, and every terminal event clears the session.
 */

export type ReasoningEvent = {
  readonly type: string
  readonly created: number
  readonly data: { readonly sessionID: string }
}

export function createReasoningTracker() {
  const active = new Set<string>()
  const latest = new Map<string, number>()

  const apply = (event: ReasoningEvent) => {
    const sessionID = event.data.sessionID
    const previous = latest.get(sessionID)
    if (previous !== undefined && event.created < previous) return
    latest.set(sessionID, event.created)

    if (event.type === "session.reasoning.started" || event.type === "session.reasoning.delta") {
      active.add(sessionID)
      return
    }
    if (
      event.type === "session.reasoning.ended" ||
      event.type === "session.idle" ||
      event.type === "session.execution.succeeded" ||
      event.type === "session.execution.failed" ||
      event.type === "session.execution.interrupted" ||
      event.type === "session.deleted"
    ) {
      active.delete(sessionID)
    }
  }

  return {
    apply,
    isActive: (sessionID: string | undefined) => sessionID !== undefined && active.has(sessionID),
  }
}
