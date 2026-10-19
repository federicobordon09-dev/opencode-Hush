/** Pure formatting helpers. Kept dependency-free so they are trivially testable. */

/** Formats a token count the way Hush renders it: 840, 12.5K, 1.2M. */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0"
  if (tokens < 1_000) return String(Math.round(tokens))
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`
  return `${(tokens / 1_000_000).toFixed(1)}M`
}

/** Formats a 0..1 ratio as a whole percentage, clamped to [0, 100]. */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "0%"
  const clamped = Math.min(1, Math.max(0, ratio))
  return `${Math.round(clamped * 100)}%`
}
