/**
 * Token and context math.
 *
 * Two functions here mirror official OpenCode implementations so Hush reports
 * exactly what the host TUI reports:
 *
 * - `totalTokens` mirrors `TokenUsage.total` from `@opencode/schema/token-usage`.
 * - `contextMessage` mirrors `lastAssistantWithUsage` from `@opencode/client/solid`.
 *
 * They are reimplemented rather than imported on purpose. A TUI plugin only gets
 * `@opencode/plugin/tui` remapped to the host runtime, so reaching into other
 * `@opencode/*` runtime modules would make loading fragile. Both algorithms are
 * small, deterministic and covered by unit tests.
 */

/** The token counters a message or session reports. Structurally identical to the host's `TokenUsageInfo`. */
export type TokenUsageView = {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cache: { readonly read: number; readonly write: number }
}

/**
 * The subset of a session message Hush reasons about. The host's
 * `SessionMessageInfo` union satisfies it, but callers map into it explicitly so
 * the core stays free of host types.
 */
export type ConversationMessage = {
  readonly id: string
  readonly type: string
  readonly status?: string
  readonly tokens?: TokenUsageView
  readonly model?: { readonly id: string; readonly providerID: string }
  readonly time?: { readonly created?: number; readonly streamed?: number; readonly completed?: number }
}

/** Sum of every counter in a usage record. */
export function totalTokens(tokens: TokenUsageView): number {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

/**
 * The tokens a session actually processed: everything the model read or wrote
 * plus the prompt it wrote into the provider cache. Cached reads are left out
 * because the provider did not have to process them again.
 */
export function processedTokens(tokens: TokenUsageView): number {
  return (usable(tokens.input) ?? 0) + (usable(tokens.output) ?? 0) + (usable(tokens.reasoning) ?? 0) + (usable(tokens.cache?.write) ?? 0)
}

/** Token totals for a set of sessions, split so the cached reads stand apart. */
export type TokenTotals = {
  /** input + output + reasoning + cache.write */
  readonly tokens: number
  /** cache.read */
  readonly cached: number
  /** Whether every supplied session record had all required finite counters. */
  readonly complete: boolean
  /** Whether at least one valid session record contributed to the total. */
  readonly available: boolean
}

/**
 * Sums the counters of every session in a family. Both totals are cumulative:
 * they describe what the whole tree consumed, not the window the context holds.
 */
export function sumTokenTotals(usages: readonly TokenUsageView[]): TokenTotals {
  let tokens = 0
  let cached = 0
  let complete = true
  let available = false
  for (const usage of usages) {
    if (!isCompleteTokenUsage(usage)) {
      complete = false
      continue
    }
    available = true
    tokens += processedTokens(usage)
    cached += usage.cache.read
  }
  return { tokens, cached, complete, available }
}

/** Host token records require five finite counters; zero is a valid counter. */
export function isCompleteTokenUsage(value: unknown): value is TokenUsageView {
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<TokenUsageView> & { cache?: Partial<TokenUsageView["cache"]> }
  return (
    usable(record.input) !== undefined &&
    usable(record.output) !== undefined &&
    usable(record.reasoning) !== undefined &&
    record.cache !== undefined &&
    usable(record.cache.read) !== undefined &&
    usable(record.cache.write) !== undefined
  )
}

/** A counter the host has not filled in yet is unknown, not negative. */
function usable(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * The assistant message whose tokens describe the context window right now: the
 * newest one carrying usage, after the last completed compaction and before the
 * revert boundary. Returns undefined when the session has no such message.
 */
export function contextMessage(
  messages: readonly ConversationMessage[],
  boundary?: string,
): ConversationMessage | undefined {
  const boundaryIndex = boundary === undefined ? -1 : messages.findIndex((message) => message.id === boundary)
  // A boundary the host sent but we cannot find means the window is unknown, not empty.
  if (boundary !== undefined && boundaryIndex === -1) return undefined
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex

  let compactionIndex = -1
  for (let index = end - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.type === "compaction" && message.status === "completed") {
      compactionIndex = index
      break
    }
  }

  for (let index = end - 1; index > compactionIndex; index -= 1) {
    const message = messages[index]
    if (message.type === "assistant" && message.tokens !== undefined) return message
  }
  return undefined
}

export type ContextUsage = {
  /** Tokens the context window holds right now. */
  readonly used: number
  /** The model's context window size, when the host knows it. */
  readonly limit?: number
  /** `used / limit`. Present only when both sides are valid and comparable. */
  readonly ratio?: number
}

/**
 * Context window usage for a message, or undefined when there is no usable
 * measurement. A missing limit still reports `used`: Hush shows what it knows
 * instead of inventing a percentage.
 */
export function contextUsage(record: ConversationMessage | undefined, limit: number | undefined): ContextUsage | undefined {
  if (record?.tokens === undefined) return undefined
  const used = totalTokens(record.tokens)
  if (!Number.isFinite(used) || used <= 0) return undefined
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return { used }
  return { used, limit, ratio: used / limit }
}

export type Pressure = "calm" | "warn" | "critical"

/** Deliberately coarse: Hush stays quiet until the window is actually tight. */
const WARN_AT = 0.7
const CRITICAL_AT = 0.9

/** Classifies a context ratio. No ratio means no pressure signal, never an invented one. */
export function contextPressure(ratio: number | undefined): Pressure {
  if (ratio === undefined || !Number.isFinite(ratio)) return "calm"
  if (ratio >= CRITICAL_AT) return "critical"
  if (ratio >= WARN_AT) return "warn"
  return "calm"
}
