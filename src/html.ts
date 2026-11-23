import { iconTags } from 'favigen'
import type { IconPublication } from 'favigen'
import { parse } from 'parse5'
import type { DefaultTreeAdapterTypes } from 'parse5'
import { fail } from './options.js'

type Tag = { readonly attrs: Readonly<Record<string, string>> }

function readDocument(html: string) {
  const document = parse(html, { sourceCodeLocationInfo: true })
  const links: Map<string, string>[] = []
  let base: string | undefined
  let insertion = 0
  let inHead = false

  function walk(node: DefaultTreeAdapterTypes.Node): void {
    if (node.nodeName === '#documentType' && node.sourceCodeLocation) insertion = node.sourceCodeLocation.endOffset
    if ('tagName' in node && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const location = node.sourceCodeLocation
      const attrs = new Map(node.attrs.map(({ name, value }) => [name, value]))
      if (node.tagName === 'link') links.push(attrs)
      if (node.tagName === 'base' && base === undefined && attrs.has('href')) base = attrs.get('href')
      if (node.tagName === 'html' && location?.startTag) insertion = location.startTag.endOffset
      if (node.tagName === 'head' && location?.startTag) {
        inHead = true
        insertion = location.endTag?.startOffset ?? location.startTag.endOffset
      }
      if (node.tagName === 'body' && location?.startTag && !inHead) insertion = location.startTag.startOffset
    }
    if ('childNodes' in node) node.childNodes.forEach(walk)
  }

  walk(document)
  return { base, links, insertion }
}

function hasRel(attrs: ReadonlyMap<string, string>, rel: string): boolean {
  return attrs.get('rel')?.toLowerCase().split(/\s+/).includes(rel) ?? false
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function serialize(tags: readonly Tag[]): string {
  return tags.map(({ attrs }) => `<link ${Object.entries(attrs)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(' ')}>`).join('\n')
}

function tagsFor(publication: IconPublication, manifestHref?: string): Tag[] {
  const tags: Tag[] = iconTags(publication)
  if (manifestHref) tags.push({ attrs: { rel: 'manifest', href: manifestHref } })
  return tags
}

export function htmlFragment(publication: IconPublication, manifestHref?: string): string {
  const links = serialize(tagsFor(publication, manifestHref))
  return links ? links + '\n' : ''
}

export function injectLinks(
  html: string,
  publication: IconPublication,
  manifestHref: string | undefined,
  file: string,
  documentUrl: string,
  mode: 'serve' | 'build',
  warn: (message: string) => void,
): { html: string; tags: Tag[] } {
  const doc = readDocument(html)
  const tags = tagsFor(publication, manifestHref).filter(({ attrs }) => {
    const rel = attrs.rel
    const authored = doc.links.some((link) => hasRel(link, rel)
      || (rel === 'apple-touch-icon' && hasRel(link, 'apple-touch-icon-precomposed')))
    if (!authored) return true
    if (rel === 'manifest' && mode === 'build') {
      fail(`${file} already has a manifest link. Disable the basic manifest or remove that link.`)
    }
    const action = rel === 'manifest' ? 'disable the basic manifest or remove that link' : 'remove it to use the generated icon'
    warn(`${file} already has a ${rel} link; ${action}.`)
    return false
  })
  if (!tags.length) return { html, tags }
  if (doc.base !== undefined) {
    const base = URL.parse(doc.base, documentUrl)
    if (base && tags.some(({ attrs }) =>
      new URL(attrs.href, base).href !== new URL(attrs.href, documentUrl).href)) {
      const message = `${file} has a <base href> that changes generated URLs. Use inject: false and manage the links explicitly, or adjust the base element.`
      if (mode === 'build') fail(message)
      warn(message)
      return { html, tags: [] }
    }
  }
  const offset = doc.insertion
  return { html: `${html.slice(0, offset)}\n${serialize(tags)}\n${html.slice(offset)}`, tags }
}

export function verifyLinks(html: string, file: string, expected: readonly Tag[]): void {
  const links = readDocument(html).links
  for (const { attrs } of expected) {
    const matches = links.filter((link) => Object.entries(attrs)
      .every(([name, value]) => name === 'rel' ? hasRel(link, value) : link.get(name) === value))
    if (matches.length !== 1 || attrs.rel === 'manifest' && links.filter((link) => hasRel(link, 'manifest')).length !== 1) {
      fail(`Generated ${attrs.rel} link in ${file} changed or was duplicated by another output writer.`)
    }
  }
}
