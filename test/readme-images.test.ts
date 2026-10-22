import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  hasImageSyntax,
  htmlImageSources,
  isAbsoluteImageUrl,
  markdownImageSources,
} from "../scripts/readme-images.ts"

const markdownImage = (source: string): string => `![capture](${source})`
const htmlImage = (source: string): string => `<img src="${source}" alt="capture" />`

describe("markdownImageSources", () => {
  it("extracts the sources of Markdown images in order", () => {
    const readme = [
      "Static text.",
      markdownImage("https://x/y-light.png"),
      markdownImage("https://x/y-dark.png"),
    ].join("\n")
    expect(markdownImageSources(readme)).toEqual([
      "https://x/y-light.png",
      "https://x/y-dark.png",
    ])
  })

  it("stops the source before a title", () => {
    expect(markdownImageSources(markdownImage("https://x/y.png \"title\""))).toEqual([
      "https://x/y.png",
    ])
  })

  it("ignores plain links, which are not images", () => {
    expect(markdownImageSources("[capture](https://x/y.png)")).toEqual([])
  })
})

describe("htmlImageSources", () => {
  it("reads double-quoted and single-quoted sources", () => {
    expect(htmlImageSources(htmlImage("https://x/y.png"))).toEqual(["https://x/y.png"])
    expect(htmlImageSources("<img src='https://x/y.png'>")).toEqual(["https://x/y.png"])
  })

  it("reads unquoted sources", () => {
    expect(htmlImageSources("<img src=https://x/y.png>")).toEqual(["https://x/y.png"])
  })

  it("finds src wherever the attributes place it, even across lines", () => {
    const readme = [
      '<div id="captures">',
      "  <img",
      '    alt="Hush on a light theme"',
      '    width="400"',
      '    src="https://x/y.png"',
      "  />",
      "</div>",
    ].join("\n")
    expect(htmlImageSources(readme)).toEqual(["https://x/y.png"])
  })

  it("reads upper-case tags and attributes", () => {
    expect(htmlImageSources('<IMG SRC="https://x/y.png">')).toEqual(["https://x/y.png"])
  })

  it("never mistakes a sibling attribute like data-src for the source", () => {
    expect(
      htmlImageSources('<img data-src="./relative.png" src="https://x/y.png">'),
    ).toEqual(["https://x/y.png"])
  })

  it("skips img tags without a source", () => {
    expect(htmlImageSources('<img alt="capture">')).toEqual([])
  })
})

describe("isAbsoluteImageUrl", () => {
  it("accepts http, https and protocol-relative sources", () => {
    expect(isAbsoluteImageUrl("https://raw.githubusercontent.com/o/r/main/d/x.png")).toBe(true)
    expect(isAbsoluteImageUrl("http://localhost/x.png")).toBe(true)
    expect(isAbsoluteImageUrl("//cdn.example.com/x.png")).toBe(true)
  })

  it("rejects every relative shape, so none can pass the check", () => {
    expect(isAbsoluteImageUrl("./docs/design/x.png")).toBe(false)
    expect(isAbsoluteImageUrl("docs/design/x.png")).toBe(false)
    expect(isAbsoluteImageUrl("/docs/design/x.png")).toBe(false)
    expect(isAbsoluteImageUrl("../x.png")).toBe(false)
  })
})

describe("hasImageSyntax", () => {
  it("lights up for either syntax", () => {
    expect(hasImageSyntax(`<table><img src="https://x/y.png"></table>`)).toBe(true)
    expect(hasImageSyntax(markdownImage("https://x/y.png"))).toBe(true)
  })

  it("stays quiet for a README without images", () => {
    expect(hasImageSyntax("No figures here.")).toBe(false)
  })
})

it("flags relative sources in either syntax but keeps valid absolute ones", () => {
  const readme = [
    markdownImage("docs/design/x.png"),
    htmlImage("./docs/design/y.png"),
    htmlImage("https://x/real.png"),
  ].join("\n")
  const sources = [...markdownImageSources(readme), ...htmlImageSources(readme)]
  expect(sources.filter((source) => !isAbsoluteImageUrl(source))).toEqual([
    "docs/design/x.png",
    "./docs/design/y.png",
  ])
})

it("the repository README passes its own rule", () => {
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8")
  const sources = [...markdownImageSources(readme), ...htmlImageSources(readme)]
  expect(sources.length).toBeGreaterThan(0)
  expect(sources.filter((source) => !isAbsoluteImageUrl(source))).toEqual([])
})
