/**
 * Pure formatting helpers.
 *
 * Dependency-free and Solid-free: each function takes a number and returns the
 * exact text the panel renders, so the whole presentation layer stays testable
 * without a host. Values are rounded here and only here.
 */

/** Formats a token count the way Hush renders it: 840, 12.5K, 200K, 1.2M. */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0"
  const rounded = Math.round(tokens)
  if (rounded < 1_000) return String(rounded)
  // The thresholds sit just below each unit so a value never prints as "1000.0K".
  if (rounded < 999_950) return `${trimZero((rounded / 1_000).toFixed(1))}K`
  if (rounded < 999_950_000) return `${trimZero((rounded / 1_000_000).toFixed(1))}M`
  return `${trimZero((rounded / 1_000_000_000).toFixed(1))}B`
}

/** `200.0` reads as `200`. Rounding still happens; only the pointless zero goes. */
function trimZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value
}

/** Formats a model's context limit the way Hush renders it: `200K max`. Undefined without a usable limit. */
export function formatLimit(limit: number | undefined): string | undefined {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return undefined
  return `${formatTokens(limit)} max`
}

/** Formats a 0..1 ratio as a whole percentage, clamped to [0, 100]. */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "0%"
  const clamped = Math.min(1, Math.max(0, ratio))
  return `${Math.round(clamped * 100)}%`
}

/** Formats an elapsed duration in milliseconds: 45s, 12m 34s, 3h 05m. */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0s"
  const seconds = Math.floor(milliseconds / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`
  if (minutes > 0) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
  return `${seconds}s`
}

/** Formats a USD amount: $0.00, <$0.01, $12.34. Anything not a positive number renders as $0.00. */
export function formatCost(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0.00"
  if (amount < 0.01) return "<$0.01"
  return `$${amount.toFixed(2)}`
}
