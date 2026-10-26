import { describe, expect, it } from "vitest"
import { resolveModelTelemetry, type ModelRef } from "../src/core/model.ts"

const model = (providerID: string, id: string): ModelRef => ({ providerID, id })

describe("model telemetry source", () => {
  it("has no model when measured, session, and selected models are absent", () => {
    expect(resolveModelTelemetry(undefined, undefined, undefined)).toEqual({ ref: undefined, source: undefined })
  })

  it("falls back to the configured session model before the selected model", () => {
    const configured = model("provider", "configured")
    const selected = model("provider", "selected")
    expect(resolveModelTelemetry(undefined, configured, selected)).toEqual({ ref: configured, source: "session" })
  })

  it("uses the selected model only when no session model exists", () => {
    const selected = model("provider", "selected")
    expect(resolveModelTelemetry(undefined, undefined, selected)).toEqual({ ref: selected, source: "selected" })
  })

  it("keeps the measured model across a selection change before new usage", () => {
    const measured = model("provider", "old")
    const selected = model("provider", "new")
    expect(resolveModelTelemetry(measured, undefined, selected)).toEqual({ ref: measured, source: "measured" })
  })

  it("switches to the new measured model after new usage arrives", () => {
    const selected = model("provider", "new")
    const measured = model("provider", "new")
    expect(resolveModelTelemetry(measured, undefined, selected)).toEqual({ ref: measured, source: "measured" })
  })
})
