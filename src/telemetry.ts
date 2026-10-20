/**
 * Reactive telemetry for one session.
 *
 * Two layers, on purpose:
 *
 * - `createSessionData` normalizes what the host already knows. Every accessor
 *   reads the host store directly, so Solid re-renders exactly when the host
 *   pushes new data. Nothing is cached, nothing is polled.
 * - `createTelemetry` adds what the host store cannot answer on its own: a
 *   one-second clock for elapsed time and the reasoning-in-progress flag, both
 *   driven by host events. Every subscription is owned by the component that
 *   created it and released when it unmounts.
 *
 * The pair exists so the store-derived view can be used and tested on its own:
 * `createSessionData` never owns a timer or an event subscription, while
 * `createTelemetry` adds the live metrics the panel needs.
 */

import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"

import {
  contextMessage,
  contextPressure,
  contextUsage,
  sumTokenTotals,
  type ContextUsage,
  type ConversationMessage,
  type Pressure,
  type TokenUsageView,
} from "./core/usage.ts"

type Context = Plugin.Context
type SessionInfo = ReturnType<Context["data"]["session"]["list"]>[number]
type SessionMessage = ReturnType<Context["data"]["session"]["message"]["list"]>[number]

/** Locations whose collections Hush already asked the host to load. One request per directory, never a poll. */
const primed = new Set<string>()

/** A model identity as the host reports it. */
export type ModelRefView = { readonly providerID: string; readonly id: string }

/** Everything Hush can read straight out of the host store for one session. */
export type SessionData = {
  readonly startedAt: Accessor<number | undefined>
  /** The model that produced the current context, falling back to the session's then the prompt's selection. */
  readonly modelRef: Accessor<ModelRefView | undefined>
  /** Friendly model name from the host catalog, falling back to the raw id. */
  readonly modelName: (ref: ModelRefView | undefined) => string | undefined
  readonly usage: Accessor<ContextUsage | undefined>
  readonly pressure: Accessor<Pressure>
  /** Tokens the whole family processed: input + output + reasoning + cache.write. */
  readonly sessionTokens: Accessor<number>
  /** Tokens the whole family read from the provider cache. */
  readonly cachedTokens: Accessor<number>
  readonly cost: Accessor<number>
  readonly branch: Accessor<string | undefined>
  /** True when a collection Hush needs could not be loaded from the host. */
  readonly degraded: Accessor<boolean>
}

/** Session data plus the metrics that only exist over time. */
export type Telemetry = SessionData & {
  /** Wall clock, ticking once per second while the panel is mounted. */
  readonly now: Accessor<number>
  readonly elapsed: Accessor<number | undefined>
  /** True while the active session is streaming reasoning content. */
  readonly reasoning: Accessor<boolean>
}

export function createSessionData(context: Context, sessionID: Accessor<string | undefined>): SessionData {
  const data = context.data
  const [degraded, setDegraded] = createSignal(false)

  const location = createMemo(() => {
    const id = sessionID()
    const info = id === undefined ? undefined : data.session.get(id)
    if (info !== undefined) return { directory: info.location.directory }
    return context.location ?? data.location.default()
  })

  createEffect(() => {
    const ref = location()
    untrack(() => {
      if (primed.has(ref.directory)) return
      primed.add(ref.directory)
      // Only the collections Hush renders. The host keeps them live from here
      // on: branch updates and model catalog changes arrive as events.
      Promise.all([data.location.model.sync(ref), data.location.vcs.sync(ref)])
        .then(() => {
          // A later successful sync clears an earlier partial-data warning.
          setDegraded(false)
        })
        .catch(() => {
          // Forget the attempt so a later mount can retry instead of staying blind.
          primed.delete(ref.directory)
          setDegraded(true)
        })
    })
  })

  const session = createMemo<SessionInfo | undefined>(() => {
    const id = sessionID()
    return id === undefined ? undefined : data.session.get(id)
  })

  const history = createMemo<ConversationMessage[]>(() => {
    const id = sessionID()
    if (id === undefined) return []
    return data.session.message.list(id).map(toConversationMessage)
  })

  const contextRecord = createMemo(() => contextMessage(history(), session()?.revert?.messageID))

  const modelRef = createMemo(() => {
    const fromContext = contextRecord()?.model
    if (fromContext !== undefined) return { providerID: fromContext.providerID, id: fromContext.id }
    const fallback = session()?.model ?? context.ui.model.current()
    if (fallback === undefined) return undefined
    return "id" in fallback
      ? { providerID: fallback.providerID, id: fallback.id }
      : { providerID: fallback.providerID, id: fallback.modelID }
  })

  const modelInfo = createMemo(() => {
    const ref = modelRef()
    if (ref === undefined) return undefined
    return data.location.model
      .list(location())
      ?.find((candidate) => candidate.modelID === ref.id && candidate.providerID === ref.providerID)
  })

  const usage = createMemo(() => contextUsage(contextRecord(), modelInfo()?.limit.context))

  const rootID = createMemo<string | undefined>(() => {
    const id = sessionID()
    return id === undefined ? undefined : data.session.root(id)
  })

  /**
   * Token totals for the whole family: the root session plus every session the
   * host groups under it. Same base as the cost the host reports, so the two
   * numbers describe the same work.
   */
  const familyTokens = createMemo(() => {
    const root = rootID()
    if (root === undefined) return undefined
    const ids = new Set<string>([root])
    for (const id of data.session.family(root)) ids.add(id)
    const usages: TokenUsageView[] = []
    for (const info of data.session.list()) {
      if (!ids.has(info.id)) continue
      usages.push(info.tokens)
    }
    return sumTokenTotals(usages)
  })

  return {
    startedAt: createMemo(() => {
      const created = session()?.time.created
      return created !== undefined && Number.isFinite(created) && created > 0 ? created : undefined
    }),
    modelRef,
    modelName: (ref) => {
      if (ref === undefined) return undefined
      const match = data.location.model
        .list(location())
        ?.find((candidate) => candidate.modelID === ref.id && candidate.providerID === ref.providerID)
      return match?.name ?? ref.id
    },
    usage,
    pressure: createMemo(() => contextPressure(usage()?.ratio)),
    sessionTokens: createMemo(() => familyTokens()?.tokens ?? 0),
    cachedTokens: createMemo(() => familyTokens()?.cached ?? 0),
    cost: createMemo(() => {
      // The host reports a root session's cost over its whole family, so subagent
      // spend is never missing and never counted twice.
      const id = rootID()
      return id === undefined ? 0 : data.session.cost(id)
    }),
    branch: createMemo(() => data.location.vcs.info(location())?.branch.current),
    degraded,
  }
}

export function createTelemetry(context: Context, sessionID: Accessor<string | undefined>): Telemetry {
  const base = createSessionData(context, sessionID)

  // One timer for the whole panel: the clock the elapsed row reads.
  const [now, setNow] = createSignal(Date.now())
  const ticker: ReturnType<typeof setInterval> = setInterval(() => setNow(Date.now()), 1_000)

  const [reasoningSessions, setReasoningSessions] = createSignal<ReadonlySet<string>>(new Set())
  const markReasoning = (id: string, active: boolean) => {
    setReasoningSessions((current) => {
      // Repeating a state the set already holds must not schedule a render.
      if (current.has(id) === active) return current
      const next = new Set(current)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const stops = [
    context.data.on("session.reasoning.started", (event) => markReasoning(event.data.sessionID, true)),
    context.data.on("session.reasoning.ended", (event) => markReasoning(event.data.sessionID, false)),
    // An indicator outliving its execution would be a lie: every terminal event
    // for a session clears its reasoning flag.
    context.data.on("session.idle", (event) => markReasoning(event.data.sessionID, false)),
    context.data.on("session.execution.succeeded", (event) => markReasoning(event.data.sessionID, false)),
    context.data.on("session.execution.failed", (event) => markReasoning(event.data.sessionID, false)),
    context.data.on("session.execution.interrupted", (event) => markReasoning(event.data.sessionID, false)),
    context.data.on("session.deleted", (event) => markReasoning(event.data.sessionID, false)),
  ]

  onCleanup(() => {
    clearInterval(ticker)
    for (const stop of stops) stop()
  })

  return {
    ...base,
    now,
    elapsed: createMemo(() => {
      const started = base.startedAt()
      if (started === undefined) return undefined
      return Math.max(0, now() - started)
    }),
    reasoning: createMemo(() => {
      const id = sessionID()
      return id !== undefined && reasoningSessions().has(id)
    }),
  }
}

/** Maps a host session message into the shape the pure core understands. */
function toConversationMessage(message: SessionMessage): ConversationMessage {
  return {
    id: message.id,
    type: message.type,
    status: "status" in message ? message.status : undefined,
    tokens: "tokens" in message ? message.tokens : undefined,
    model: "model" in message ? message.model : undefined,
    time: "time" in message ? message.time : undefined,
  }
}
