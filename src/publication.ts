import { readdir, stat } from 'node:fs/promises'
import { join, posix } from 'node:path'
import type { IconPublication } from '@jo-hemphill/favigen'
import { missing } from './generation.js'
import type { GeneratedIcon, Generation } from './generation.js'
import { fail, manifestFile } from './options.js'
import type { ResolvedOptions } from './options.js'

const placeholderOrigin = 'https://vite-favicon.invalid'
const httpUrl = /^https?:\/\//i

export function staticReference(value: string, label: string): string {
  if (typeof value !== 'string' || !value || /[\s\\\p{Cc}]/u.test(value)
    || /^(?:\/\/|[?#])/.test(value) || (/^[a-z][a-z\d+.-]*:/i.test(value) && !httpUrl.test(value))) {
    fail(`${label} must be a static HTTP(S), root-relative, or document-relative URL.`)
  }
  try {
    const parsed = new URL(value, placeholderOrigin)
    if (!parsed.username && !parsed.password) return value
  } catch {
    // Use the option-specific error for malformed URLs.
  }
  fail(`${label} must be a static URL without credentials.`)
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function directory(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

function relativeReference(referrer: string, target: string): string {
  const path = encodePath(posix.relative(posix.dirname(referrer), target))
  return path.startsWith('../') ? path : `./${path}`
}

export function devUrl(options: ResolvedOptions, fileName: string): string {
  const base = new URL(options.config.base || '/', placeholderOrigin).pathname
  return `${directory(base)}${encodePath(fileName)}`
}

function assetUrl(options: ResolvedOptions, fileName: string, referrer: string): string {
  const base = options.config.base
  if (!base || base === './') return relativeReference(referrer, fileName)
  if (httpUrl.test(base)) return new URL(encodePath(fileName), directory(base)).href
  return `${directory(base)}${encodePath(fileName)}`
}

export function bindGeneration(
  options: ResolvedOptions,
  generation: Generation,
  mode: 'serve' | 'build',
  referrer = 'index.html',
  icons: readonly GeneratedIcon[] = generation.icons,
): IconPublication {
  return options.favigen.bindIcons(icons, new Map(icons.map(({ id, fileName }) => {
    const defaultUrl = mode === 'serve' ? devUrl(options, fileName) : assetUrl(options, fileName, referrer)
    const url = mode === 'build' && options.resolveIconUrl
      ? staticReference(options.resolveIconUrl({ outputFileName: fileName, referrerFile: referrer, defaultUrl }), 'resolveIconUrl')
      : defaultUrl
    return [id, { outputFileName: fileName, url }]
  })), generation.revision)
}

export interface ManifestOutput {
  readonly build: (publication: IconPublication) => string
  readonly serve: (publication: IconPublication) => string
  readonly href: (referrer: string) => string
  readonly documentUrl: (file: string) => string
}

export function createManifest(options: ResolvedOptions, requestedBase: string | undefined): ManifestOutput | undefined {
  if (!options.manifest) return
  const { appBase, startUrl, scope, ...payload } = options.manifest
  const base = options.config.base
  const isRelative = !base || base === './'
  const configuredBase = options.config.command === 'serve' ? requestedBase ?? base : base
  if (appBase === undefined && httpUrl.test(configuredBase)) {
    fail('A basic manifest with an absolute Vite base requires manifest.appBase (the app deployment URL).')
  }
  const pathBase = httpUrl.test(configuredBase) ? '/' : new URL(configuredBase || '/', placeholderOrigin).pathname
  const app = new URL(appBase === undefined ? directory(pathBase) : staticReference(appBase, 'manifest.appBase'), placeholderOrigin)
  if (appBase !== undefined && (!httpUrl.test(appBase) || app.search || app.hash)) {
    fail('manifest.appBase must be an absolute HTTP(S) app directory URL without a query or fragment.')
  }
  app.pathname = directory(app.pathname)
  const publishedManifest = new URL(manifestFile, app)
  const launch = new URL(staticReference(startUrl ?? './', 'manifest.startUrl'), publishedManifest)
  const boundary = new URL(staticReference(scope ?? './', 'manifest.scope'), publishedManifest)
  for (const [key, url] of [['startUrl', launch], ['scope', boundary]] as const) {
    if (url.origin !== app.origin || !url.pathname.startsWith(app.pathname)) {
      fail(`manifest.${key} must be within the app mount ${app.pathname}. Use an app-relative path or a companion manifest.`)
    }
  }
  if (!launch.pathname.startsWith(boundary.pathname)) fail('manifest.scope must contain manifest.startUrl.')

  const suffix = launch.search + launch.hash
  const launchPath = launch.pathname.slice(app.pathname.length)
  const scopePath = boundary.pathname.slice(app.pathname.length)
  const localBase = devUrl(options, '')
  const devApp = new URL(localBase, placeholderOrigin)
  const localManifest = new URL(manifestFile, devApp)

  const serialize = (
    publication: IconPublication,
    appUrl: URL,
    manifestUrl: URL,
    startUrl: string,
    scope: string,
  ) => JSON.stringify(options.favigen.buildBasicManifest(publication, {
    ...payload, appUrl: appUrl.href, manifestUrl: manifestUrl.href, startUrl, scope,
  }), null, 2) + '\n'

  return {
    build(publication) {
      return serialize(publication, app, publishedManifest,
        isRelative ? `./${launchPath}${suffix}` : launch.pathname + suffix,
        isRelative ? `./${scopePath}` : boundary.pathname)
    },
    serve(publication) {
      return serialize(publication, devApp, localManifest,
        localBase + launchPath + suffix, localBase + scopePath)
    },
    href(referrer) {
      return isRelative ? relativeReference(referrer, manifestFile) : publishedManifest.pathname
    },
    documentUrl(file) {
      return new URL(encodePath(file), app).href
    },
  }
}

export function documentUrl(options: ResolvedOptions, file: string): string {
  const base = options.config.base
  return new URL(encodePath(file), new URL(base === './' ? '/' : directory(base), placeholderOrigin)).href
}

/** Find an existing path or blocking parent, including casing differences on POSIX. */
export async function publicCollision(root: string, fileName: string): Promise<string | undefined> {
  const segments = fileName.split('/')
  async function search(parent: string, depth: number): Promise<string | undefined> {
    let entries: string[]
    try {
      entries = await readdir(parent)
    } catch (error) {
      if (missing(error)) return
      throw error
    }
    const segment = segments[depth].toLowerCase()
    for (const entry of entries.filter((name) => name.toLowerCase() === segment)) {
      const path = join(parent, entry)
      try {
        if (depth === segments.length - 1 || !(await stat(path)).isDirectory()) return path
      } catch (error) {
        if (missing(error)) continue
        throw error
      }
      const conflict = await search(path, depth + 1)
      if (conflict) return conflict
    }
  }
  return search(root, 0)
}
