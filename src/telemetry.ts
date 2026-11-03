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

import { createEffect, createMemo, createRenderEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"

import type { SubagentSnapshot } from "./core/subagents.ts"
import {
  activeTools as readActiveTools,
  createExecutionErrorTracker,
  recentExecutionError,
  type RecentExecutionError,
  type SessionRunState,
} from "./core/awareness.ts"
import { isCostAvailable } from "./core/cost.ts"
import { resolveModelTelemetry, type ModelRef, type ModelSource } from "./core/model.ts"
import { createReasoningTracker } from "./core/reasoning.ts"
import {
  contextMessage,
  contextPressure,
  contextUsage,
  processedTokens,
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
export type ModelRefView = ModelRef

/** Everything Hush can read straight out of the host store for one session. */
export type SessionData = {
  readonly startedAt: Accessor<number | undefined>
  /** The model that produced the current context, falling back to the session's then the prompt's selection. */
  readonly modelRef: Accessor<ModelRefView | undefined>
  /** Where the displayed model reference came from; presentation stays unchanged. */
  readonly modelSource: Accessor<ModelSource | undefined>
  /** Friendly model name from the host catalog, falling back to the raw id. */
  readonly modelName: (ref: ModelRefView | undefined) => string | undefined
  readonly usage: Accessor<ContextUsage | undefined>
  readonly pressure: Accessor<Pressure>
  /** Tokens the whole family processed: input + output + reasoning + cache.write. */
  readonly sessionTokens: Accessor<number>
  /** Tokens the whole family read from the provider cache. */
  readonly cachedTokens: Accessor<number>
  /** True when at least one family usage record was invalid or incomplete. */
  readonly tokensIncomplete: Accessor<boolean>
  /** True when at least one valid family usage record is available. */
  readonly tokensAvailable: Accessor<boolean>
  readonly cost: Accessor<number>
  /** True when the host still has the root session and its cost is safe to show. */
  readonly costAvailable: Accessor<boolean>
  readonly branch: Accessor<string | undefined>
  /** One snapshot per subagent session in the family, mapped out of the host store. */
  readonly subagents: Accessor<readonly SubagentSnapshot[]>
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
  readonly awareness: SessionAwareness
}

/** OpenCode 2.1 session awareness. Each optional collection is absent until its sync succeeds. */
export type SessionAwareness = {
  readonly status: Accessor<SessionRunState | undefined>
  readonly permissions: Accessor<number | undefined>
  readonly forms: Accessor<number | undefined>
  readonly activeTools: Accessor<ReturnType<typeof readActiveTools>>
  readonly error: Accessor<RecentExecutionError | undefined>
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
      Promise.all([data.location.model.sync(ref), data.location.vcs.sync(ref), data.location.agent.sync(ref)])
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

  const configuredModel = createMemo<ModelRefView | undefined>(() => {
    const model = session()?.model
    if (model !== undefined) return { providerID: model.providerID, id: model.id }
    return undefined
  })

  const selectedModel = createMemo<ModelRefView | undefined>(() => {
    const model = context.ui.model.current()
    if (model === undefined) return undefined
    return { providerID: model.providerID, id: model.modelID }
  })

  const modelTelemetry = createMemo(() => {
    const fromContext = contextRecord()?.model
    const measured = fromContext === undefined ? undefined : { providerID: fromContext.providerID, id: fromContext.id }
    return resolveModelTelemetry(measured, configuredModel(), selectedModel())
  })

  const modelRef = createMemo(() => modelTelemetry().ref)

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

  /** Friendly model name from the host catalog, falling back to the raw id. */
  const modelName = (ref: ModelRefView | undefined): string | undefined => {
    if (ref === undefined) return undefined
    const match = data.location.model
      .list(location())
      ?.find((candidate) => candidate.modelID === ref.id && candidate.providerID === ref.providerID)
    return match?.name ?? ref.id
  }

  /** Agent display name from the host catalog, falling back to the raw agent id. */
  const agentName = (id: string | undefined): string | undefined => {
    if (id === undefined) return undefined
    const match = data.location.agent
      .list(location())
      ?.find((candidate) => candidate.id === id)
    return match?.name ?? id
  }

  /**
   * One snapshot per subagent in the session family: every session the host
   * groups under the root that reports a `parentID`. The reads go through the
   * same live store as the rest of the panel — new, updated and finished
   * subagents arrive as host events, never as polls.
   */
  const subagents = createMemo<SubagentSnapshot[]>(() => {
    const root = rootID()
    if (root === undefined) return []
    const snapshots: SubagentSnapshot[] = []
    for (const id of data.session.family(root)) {
      const info = data.session.get(id)
      if (info === undefined || info.parentID === undefined) continue
      snapshots.push({
        id: info.id,
        agent: info.agent,
        agentName: agentName(info.agent),
        model: info.model === undefined ? undefined : modelName({ providerID: info.model.providerID, id: info.model.id }),
        title: info.title,
        status: data.session.status(info.id),
        outcome: info.outcome,
        tokens: processedTokens(info.tokens),
        createdAt: info.time?.created,
        endedAt: info.time?.idle ?? info.time?.updated,
      })
    }
    return snapshots
  })

  const cost = createMemo(() => {
    const id = rootID()
    return id === undefined ? 0 : data.session.cost(id)
  })

  return {
    startedAt: createMemo(() => {
      const created = session()?.time.created
      return created !== undefined && Number.isFinite(created) && created > 0 ? created : undefined
    }),
    modelRef,
    modelSource: createMemo(() => modelTelemetry().source),
    modelName,
    usage,
    pressure: createMemo(() => contextPressure(usage()?.ratio)),
    sessionTokens: createMemo(() => familyTokens()?.tokens ?? 0),
    cachedTokens: createMemo(() => familyTokens()?.cached ?? 0),
    tokensIncomplete: createMemo(() => familyTokens() !== undefined && !familyTokens()!.complete),
    tokensAvailable: createMemo(() => familyTokens()?.available ?? false),
    cost,
    costAvailable: createMemo(() => {
      const id = rootID()
      const value = cost()
      return id !== undefined && isCostAvailable(data.session.get(id) !== undefined, value)
    }),
    branch: createMemo(() => data.location.vcs.info(location())?.branch.current),
    subagents,
    degraded,
  }
}

export function createTelemetry(context: Context, sessionID: Accessor<string | undefined>): Telemetry {
  const base = createSessionData(context, sessionID)

  const awareness = createSessionAwareness(context, sessionID)

  // One timer for the whole panel: the clock the elapsed row reads.
  const [now, setNow] = createSignal(Date.now())
  const ticker: ReturnType<typeof setInterval> = setInterval(() => setNow(Date.now()), 1_000)

  // There is no host snapshot for reasoning; consume the durable event stream
  // and reject late events so a stale delivery cannot resurrect old state.
  const reasoning = createReasoningTracker()
  const onReasoning = (event: { readonly created: number; readonly data: { readonly sessionID: string }; readonly type: string }) => {
    reasoning.apply(event)
    setReasoningRevision((revision) => revision + 1)
  }
  const [reasoningRevision, setReasoningRevision] = createSignal(0)

  const stops = [
    context.data.on("session.reasoning.started", onReasoning),
    context.data.on("session.reasoning.delta", onReasoning),
    context.data.on("session.reasoning.ended", onReasoning),
    context.data.on("session.idle", onReasoning),
    context.data.on("session.execution.succeeded", onReasoning),
    context.data.on("session.execution.failed", onReasoning),
    context.data.on("session.execution.interrupted", onReasoning),
    context.data.on("session.deleted", onReasoning),
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
      reasoningRevision()
      return reasoning.isActive(id)
    }),
    awareness,
  }
}

/** Hydrates one session's attention data, then relies on OpenCode's reactive stores for updates. */
export function createSessionAwareness(context: Context, sessionID: Accessor<string | undefined>): SessionAwareness {
  const data = context.data
  const errors = createExecutionErrorTracker()
  const [sessionReady, setSessionReady] = createSignal<string>()
  const [messagesReady, setMessagesReady] = createSignal<string>()
  const [permissionsReady, setPermissionsReady] = createSignal<string>()
  const [formsReady, setFormsReady] = createSignal<string>()
  const [errorRevision, setErrorRevision] = createSignal(0)

  let generation = 0
  const isCurrent = (id: string, ticket: number) => {
    const result = ticket === generation && sessionID() === id
    return result
  }

  const onExecutionEvent = (event: {
    readonly type: string
    readonly created: number
    readonly data: { readonly sessionID: string; readonly error?: unknown }
  }) => {
    errors.apply(event, sessionID())
    setErrorRevision((revision) => revision + 1)
  }

  const stops = [
    data.on("session.execution.started", onExecutionEvent),
    data.on("session.execution.succeeded", onExecutionEvent),
    data.on("session.execution.failed", onExecutionEvent),
    data.on("session.execution.interrupted", onExecutionEvent),
  ]

  createRenderEffect(() => {
    const id = sessionID()
    const ticket = ++generation
    errors.activate(id)
    setSessionReady(undefined)
    setMessagesReady(undefined)
    setPermissionsReady(undefined)
    setFormsReady(undefined)
    if (id === undefined) return

    const ref = locationForSession(context, id)
    void data.session.sync(id).then(() => {
      if (isCurrent(id, ticket)) setSessionReady(id)
    }).catch(() => {})
    void data.session.message.sync(id).then(() => {
      if (!isCurrent(id, ticket)) return
      const snapshot = data.session.status(id) === "running"
        ? undefined
        : recentExecutionError(data.session.message.list(id))
      errors.hydrate(id, snapshot)
      setMessagesReady(id)
    }).catch(() => {})
    void data.session.permission.sync(id).then(() => {
      if (isCurrent(id, ticket)) setPermissionsReady(id)
    }).catch(() => {})
    void data.session.form.sync(id, ref).then(() => {
      if (isCurrent(id, ticket)) setFormsReady(id)
    }).catch(() => {})
  })

  onCleanup(() => {
    generation += 1
    for (const stop of stops) stop()
  })

  return {
    status: () => {
      const id = sessionID()
      if (id === undefined || sessionReady() !== id || data.session.get(id) === undefined) return undefined
      return data.session.status(id)
    },
    permissions: () => {
      const id = sessionID()
      if (id === undefined || permissionsReady() !== id) return undefined
      const requests = data.session.permission.list(id)
      return requests?.length
    },
    forms: () => {
      const id = sessionID()
      if (id === undefined || formsReady() !== id) return undefined
      const forms = data.session.form.list(id, locationForSession(context, id))
      return forms?.length
    },
    activeTools: () => {
      const id = sessionID()
      if (id === undefined || messagesReady() !== id) return []
      return readActiveTools(data.session.message.list(id))
    },
    error: () => {
      errorRevision()
      const id = sessionID()
      if (id === undefined || messagesReady() !== id) return undefined
      return errors.current(id)
    },
  }
}

function locationForSession(context: Context, id: string) {
  const session = context.data.session.get(id)
  return session === undefined
    ? context.location ?? context.data.location.default()
    : { directory: session.location.directory }
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
