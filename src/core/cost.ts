/** Whether a host cost value can be shown for an existing root session. */
export function isCostAvailable(rootExists: boolean, cost: number): boolean {
  return rootExists && Number.isFinite(cost) && cost >= 0
}
