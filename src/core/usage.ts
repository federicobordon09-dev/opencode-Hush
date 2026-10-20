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

/** One measurement point: the cumulative tokens a session had at a wall-clock time. */
export type RateSample = { readonly at: number; readonly total: number }

/** Rolling window used to measure generation speed. */
export const RATE_WINDOW_MS = 8_000

/** Below this span a sample pair says nothing about speed. */
const RATE_MIN_SPAN_MS = 400

/**
 * Tokens per second across the newest window of samples, or undefined when the
 * samples cannot support a trustworthy number (too few, too close together, or
 * no growth). Callers hide the metric rather than render a fabricated zero.
 */
export function generationRate(samples: readonly RateSample[], now: number, windowMs = RATE_WINDOW_MS): number | undefined {
  if (samples.length < 2 || !Number.isFinite(now)) return undefined
  const fresh = samples.filter((sample) => Number.isFinite(sample.at) && now - sample.at <= windowMs)
  if (fresh.length < 2) return undefined

  const first = fresh[0]
  const last = fresh[fresh.length - 1]
  const span = last.at - first.at
  if (!Number.isFinite(span) || span < RATE_MIN_SPAN_MS) return undefined

  const delta = last.total - first.total
  if (!Number.isFinite(delta) || delta <= 0) return undefined
  return delta / (span / 1_000)
}
