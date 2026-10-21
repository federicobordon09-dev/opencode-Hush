/**
 * Layout contract for the Context bar's fill box.
 *
 * Dependency-free and Solid-free: the function takes a usage ratio and returns
 * the exact two width props the panel puts on the fill box, so this piece of
 * presentation stays testable without a host. The bar is a flex row the full
 * width of the panel — a fill box drawing `width` percent of the row, and a
 * track box growing into what is left; both are drawn with border glyphs, so a
 * zero-cell box draws nothing.
 *
 * - A ratio at or below 0 draws no fill: the whole row reads as the faint track.
 * - A ratio above 0 keeps the fill at least one cell. Without a minimum a small
 *   ratio in a narrow sidebar (4% of 20 columns) rounds down to zero cells and
 *   the fill vanishes; a one-cell minimum costs nothing at wide widths.
 * - The percentage is clamped to [0, 100], so a ratio at or above 1 claims the
 *   entire row and leaves the track nothing to grow into.
 */

export interface BarFill {
  /** Percentage of the row the fill box claims, clamped to 0–100. */
  readonly width: `${number}%`
  /** Smallest number of cells the fill may occupy: 0 hides it, 1 keeps it visible. */
  readonly minWidth: 0 | 1
}

export function barFill(ratio: number): BarFill {
  const clamped = Math.min(100, Math.max(0, ratio * 100))
  return { width: `${clamped}%`, minWidth: clamped > 0 ? 1 : 0 }
}
