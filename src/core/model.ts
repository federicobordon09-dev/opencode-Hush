export type ModelRef = { readonly providerID: string; readonly id: string }
export type ModelSource = "measured" | "session" | "selected"

export type ModelTelemetry = {
  readonly ref: ModelRef | undefined
  readonly source: ModelSource | undefined
}

/** Resolves display state without claiming that a selected model produced usage. */
export function resolveModelTelemetry(
  measured: ModelRef | undefined,
  configured: ModelRef | undefined,
  selected: ModelRef | undefined,
): ModelTelemetry {
  if (measured !== undefined) return { ref: measured, source: "measured" }
  if (configured !== undefined) return { ref: configured, source: "session" }
  if (selected !== undefined) return { ref: selected, source: "selected" }
  return { ref: undefined, source: undefined }
}
