import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname } from 'node:path'
import type { IconOverride, PreparedSource, RenderedIcon } from '@jo-hemphill/favigen'
import { outputName, pluginName, rootIcoId } from './options.js'
import type { IconOverride as SourceOverride, ResolvedOptions } from './options.js'

export function digest(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function missing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export async function watchPaths(paths: ReadonlySet<string>): Promise<string[]> {
  const watched = new Set<string>()
  await Promise.all([...paths].map(async (path) => {
    let candidate = path
    for (;;) {
      try {
        await stat(candidate)
        watched.add(candidate)
        return
      } catch (error) {
        if (!missing(error)) throw error
      }
      const parent = dirname(candidate)
      if (candidate === parent) return
      candidate = parent
    }
  }))
  return [...watched]
}

export interface GeneratedIcon extends RenderedIcon {
  readonly fileName: string
}

export interface Generation {
  readonly revision: string
  readonly icons: readonly GeneratedIcon[]
}

async function findSource(options: ResolvedOptions): Promise<string> {
  if (options.source) return options.source
  const present = []
  for (const candidate of options.candidates) {
    try {
      if ((await stat(candidate)).isFile()) present.push(candidate)
    } catch (error) {
      if (!missing(error)) throw error
    }
  }
  if (present.length === 1) return present[0]
  const problem = present.length ? 'Found both default logo files' : 'Could not find a default logo'
  throw new Error(`${problem}: ${options.candidates.join(', ')}. Set source to an SVG, PNG, JPEG, or WebP file.`)
}

export function createGenerator(options: ResolvedOptions, warn: (message: string) => void) {
  const { createDiskCache, planIcons, prepareSource, renderIcon } = options.favigen
  const cacheError = (error: Error) => warn(`Icon cache: ${error.message}`)
  const cache = options.cacheDir === false ? false : createDiskCache(options.cacheDir, { onError: cacheError })
  const previous = new Map<string, { digest: string; source: PreparedSource }>()

  async function prepare(path: string): Promise<PreparedSource> {
    try {
      const bytes = await readFile(path)
      const hash = digest(bytes)
      const existing = previous.get(path)
      if (existing?.digest === hash) return existing.source
      const source = await prepareSource(bytes)
      previous.set(path, { digest: hash, source })
      return source
    } catch (error) {
      throw new Error(`Artwork ${path}: ${describe(error)}`, { cause: error })
    }
  }

  return async (): Promise<Generation> => {
    try {
      const path = await findSource(options)
      const prepared = new Map<string, Promise<PreparedSource>>()
      function readSource(file: string): Promise<PreparedSource> {
        const pending = prepared.get(file)
        if (pending) return pending
        const result = prepare(file)
        prepared.set(file, result)
        return result
      }

      async function prepareOverrides<K extends string>(
        overrides: Readonly<Partial<Record<K, SourceOverride>>>,
      ): Promise<Partial<Record<K, IconOverride>>> {
        return Object.fromEntries(await Promise.all(
          Object.entries<SourceOverride | undefined>(overrides)
            .filter((entry): entry is [string, SourceOverride] => !!entry[1])
            .map(async ([key, override]) => {
              const { source, ...rest } = override
              return [key, { ...rest, source: source && await readSource(source) }]
            }),
        )) as Partial<Record<K, IconOverride>>
      }

      const [source, variants, targets] = await Promise.all([
        readSource(path), prepareOverrides(options.variants), prepareOverrides(options.targets),
      ])
      const plan = planIcons(source, { profile: options.profile, ids: options.ids, render: options.render, variants, targets })
      const sourceFiles = new Map((await Promise.all(
        [...prepared].map(async ([file, pending]) => [(await pending).id, file] as const),
      )))
      for (const finding of plan.diagnostics) {
        warn(`${finding.message} (${finding.targetIds.join(', ')}; ${sourceFiles.get(finding.sourceId) ?? path})`)
      }
      const icons = await Promise.all(plan.icons.map(async (spec): Promise<GeneratedIcon> => {
        try {
          // Per-icon calls keep the failing target visible and share Favigen's plane cache.
          const icon = await renderIcon(plan, spec.id, { cache, onCacheError: cacheError })
          const extension = extname(icon.name)
          const fileName = options.rootIco && icon.id === rootIcoId ? rootIcoId
            : `${options.outputDir}/${icon.name.slice(0, -extension.length)}.${icon.digest.slice(0, 16)}${extension}`
          return Object.freeze({ ...icon, fileName: outputName(fileName, `Output for ${icon.id}`) })
        } catch (error) {
          throw new Error(`Target ${spec.id} from ${sourceFiles.get(spec.sourceId) ?? path}: ${describe(error)}`, { cause: error })
        }
      }))
      return Object.freeze({
        icons: Object.freeze(icons),
        revision: digest(JSON.stringify(icons.map(({ id, digest, fileName }) => [id, digest, fileName]))),
      })
    } catch (error) {
      throw new Error(`[${pluginName}] ${describe(error)}`, { cause: error })
    }
  }
}
