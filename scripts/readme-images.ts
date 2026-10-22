/**
 * Image sources in a package README, for verify:pack.
 *
 * npm renders the README on the package page, so every image must point at an
 * absolute URL: a relative path breaks the moment the README leaves the
 * repository. The README may carry images in two syntaxes:
 *
 * - Markdown: `![alt](source)`
 * - HTML: `<img src="source">`, in any attribute position, upper- or
 *   lowercase, single- or double-quoted, or unquoted
 *
 * Absolute means `http://…`, `https://…` or a protocol-relative `//…`.
 * Everything else — `./docs/x.png`, `docs/x.png` and even a root-relative
 * `/x.png` — is relative and must fail the packaging check.
 */

/** Sources of every Markdown image, in document order. */
export function markdownImageSources(readme: string): string[] {
  return [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((match) => match[1])
}

/**
 * Sources of every HTML <img> tag, in document order. The required whitespace
 * before `src` keeps sibling attributes like `data-src` from matching; the
 * three alternatives cover double-quoted, single-quoted and unquoted values.
 */
export function htmlImageSources(readme: string): string[] {
  const sources: string[] = []
  const image = /<img\b[^>]*?\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  for (const match of readme.matchAll(image)) {
    sources.push(match[1] ?? match[2] ?? match[3] ?? "")
  }
  return sources
}

/** An npm README may only reference images over an absolute URL. */
export function isAbsoluteImageUrl(source: string): boolean {
  return /^(https?:)?\/\//.test(source)
}

/**
 * Quick syntax scan: does the README appear to carry images at all? verify:pack
 * uses it so a silently broken extraction can never pass the check vacuously:
 * a README that shows image syntax but yields no sources is a failure.
 */
export function hasImageSyntax(readme: string): boolean {
  return /!\[[^\]]*\]\(/.test(readme) || /<img\b/i.test(readme)
}
