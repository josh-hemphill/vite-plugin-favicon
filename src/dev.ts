import { resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { IconPublication } from '@jo-hemphill/favigen'
import type { ViteDevServer } from 'vite'
import { describe, digest, watchPaths } from './generation.js'
import type { Generation } from './generation.js'
import { htmlFragment, injectLinks } from './html.js'
import { manifestFile, requiredAppIds, rootIcoId } from './options.js'
import type { ResolvedOptions } from './options.js'
import { bindGeneration, devUrl, publicCollision } from './publication.js'
import type { ManifestOutput } from './publication.js'

interface DevAsset {
  readonly bytes: Uint8Array | string
  readonly type: string
  readonly etag: string
  readonly immutable?: boolean
}

interface DevPublication {
  readonly publication: IconPublication
  readonly manifestAvailable: boolean
}

function respond(req: IncomingMessage, res: ServerResponse, asset: DevAsset): void {
  const etag = `"${asset.etag}"`
  res.setHeader('ETag', etag)
  res.setHeader('Cache-Control', asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
  if (req.headers['if-none-match']?.split(',').some((value) => ['*', etag].includes(value.trim().replace(/^W\//, '')))) {
    res.statusCode = 304
    res.end()
    return
  }
  res.setHeader('Content-Type', asset.type)
  res.setHeader('Content-Length', Buffer.byteLength(asset.bytes))
  res.end(req.method === 'HEAD' ? undefined : asset.bytes)
}

export function createDev(
  options: ResolvedOptions,
  server: ViteDevServer,
  generate: () => Promise<Generation>,
  manifest: ManifestOutput | undefined,
  warn: (message: string) => void,
) {
  let current: Generation | undefined
  let previous: Generation | undefined
  let revision = 0
  let attempt: { revision: number; done: Promise<void> } | undefined
  let blocked = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let sourceDirty = false

  const publicDir = options.config.publicDir
  const stableNames = [
    ...(options.rootIco ? [rootIcoId] : []),
    ...(manifest ? [manifestFile] : []),
    ...(options.htmlFragment ? [options.htmlFragment.file] : []),
  ]
  const stableUrls = new Map(stableNames.map((name) => [devUrl(options, name), name]))
  const watchedPaths = new Set([...options.sources, ...(publicDir ? [publicDir] : [])])
  for (const key of stableNames) {
    if (publicDir) watchedPaths.add(resolve(publicDir, key))
  }

  function reload(): void {
    if (!closed) server.ws.send({ type: 'full-reload', path: '*' })
  }

  async function isBlocked(name: string): Promise<boolean> {
    if (!publicDir) return false
    const file = await publicCollision(publicDir, name)
    if (!file) return false
    warn(`Public file ${file} takes precedence over generated dev route ${devUrl(options, name)}. Rename the generated output or move the public file.`)
    return true
  }

  async function listBlocked(generation: Generation | undefined): Promise<Set<string>> {
    const names = [...stableNames, ...generation?.icons.map((icon) => icon.fileName) ?? []]
    const results = await Promise.all(names.map(async (name) => await isBlocked(name) ? name : undefined))
    return new Set(results.filter((name): name is string => !!name))
  }

  function start(): Promise<void> {
    if (attempt?.revision === revision) return attempt.done
    const token = revision
    const wasActivated = attempt !== undefined
    const done = (async () => {
      try {
        const next = await generate()
        if (closed || token !== revision) return
        const occupied = await listBlocked(next)
        if (closed || token !== revision) return
        const changed = current?.revision !== next.revision
        if (changed) {
          previous = current
          current = next
        }
        blocked = occupied
        if (changed && wasActivated) reload()
      } catch (error) {
        if (!closed && token === revision) warn(describe(error))
      }
    })()
    attempt = { revision: token, done }
    return done
  }

  async function generation(): Promise<Generation | undefined> {
    while (!current && !closed) {
      const token = revision
      await start()
      if (token === revision) break
    }
    return current
  }

  async function published(): Promise<DevPublication | undefined> {
    const active = await generation()
    if (!active) return
    const occupied = await listBlocked(active)
    const icons = active.icons.filter(({ fileName }) => !occupied.has(fileName))
    return {
      publication: bindGeneration(options, active, 'serve', 'index.html', icons),
      manifestAvailable: !!manifest && !occupied.has(manifestFile)
        && requiredAppIds.every((id) => icons.some((icon) => icon.id === id)),
    }
  }

  async function ensureWatched(): Promise<void> {
    const paths = await watchPaths(watchedPaths)
    if (!closed) server.watcher.add(paths)
  }

  function intersects(path: string, selected: string): boolean {
    return path === selected || selected.startsWith(path + sep)
  }

  function change(event: string, path: string): void {
    if (!['add', 'addDir', 'change', 'unlink', 'unlinkDir'].includes(event)) return
    const file = resolve(options.config.server.watch?.cwd ?? options.config.root, path)
    const source = [...options.sources].some((path) => intersects(file, path))
    const routeNames = [...stableNames, ...current?.icons.map((icon) => icon.fileName) ?? []]
    const publicChange = !!publicDir && routeNames.some((name) =>
      intersects(file.toLowerCase(), resolve(publicDir, name).toLowerCase()))
    if (!source && !publicChange) return
    if (source) {
      revision++
      sourceDirty = !!attempt
      void ensureWatched().catch((error: unknown) => warn(describe(error)))
    }
    if (!attempt) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (closed) return
      if (sourceDirty) {
        sourceDirty = false
        void start()
        return
      }
      void listBlocked(current).then((occupied) => {
        if (closed) return
        const changed = blocked.size !== occupied.size || [...occupied].some((name) => !blocked.has(name))
        blocked = occupied
        if (changed) reload()
      }).catch((error: unknown) => warn(describe(error)))
    }, 40)
    timer.unref()
  }

  function close(): void {
    closed = true
    clearTimeout(timer)
    server.watcher.off('all', change)
  }

  server.watcher.on('all', change)
  server.httpServer?.once('close', close)
  void ensureWatched().catch((error: unknown) => warn(describe(error)))

  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const pathname = req.url?.split('?', 1)[0]
    if (!pathname) return next()
    const stableName = stableUrls.get(pathname)
    let candidate = [...current?.icons ?? [], ...previous?.icons ?? []]
      .find(({ fileName }) => devUrl(options, fileName) === pathname)
    if (!stableName && !candidate) return next()
    const name = stableName ?? candidate?.fileName
    if (!name || await isBlocked(name)) return next()

    const isManifest = !!manifest && stableName === manifestFile
    if (isManifest || (stableName && stableName === options.htmlFragment?.file)) {
      const ready = await published()
      if (ready && isManifest && !ready.manifestAvailable) {
        res.statusCode = 404
        res.end()
        return
      }
      if (ready) {
        const bytes = isManifest ? manifest!.serve(ready.publication) : htmlFragment(
          options.favigen.iconTags(ready.publication), ready.manifestAvailable ? devUrl(options, manifestFile) : undefined,
        )
        respond(req, res, {
          bytes, etag: digest(bytes), type: isManifest ? 'application/manifest+json; charset=utf-8' : 'text/html; charset=utf-8',
        })
        return
      }
    } else {
      if (!candidate) candidate = (await generation())?.icons.find((icon) => icon.fileName === stableName)
      if (candidate) {
        respond(req, res, {
          bytes: candidate.bytes, type: candidate.mimeType, etag: candidate.digest, immutable: !stableName,
        })
        return
      }
    }
    res.statusCode = 404
    res.end()
  }

  server.middlewares.use((req, res, next) => {
    void handle(req, res, next).catch(next)
  })

  return {
    close,
    async getIcons(): Promise<IconPublication | undefined> {
      return (await published())?.publication
    },
    async transform(html: string, path: string): Promise<string> {
      if (!options.inject) return html
      const ready = await published()
      if (!ready) return html
      const href = ready.manifestAvailable ? devUrl(options, manifestFile) : undefined
      const url = new URL(path, 'https://vite-favicon.invalid')
      const base = devUrl(options, '')
      if (!url.pathname.startsWith(base)) url.pathname = base + url.pathname.replace(/^\//, '')
      return injectLinks(html, options.favigen.iconTags(ready.publication), href, path, url.href, 'serve', warn).html
    },
  }
}
