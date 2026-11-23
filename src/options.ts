import { isAbsolute, join, resolve } from 'node:path'
import type { IconOverride as FavigenOverride, IconRole, PlanOptions } from 'favigen'
import type { ResolvedConfig } from 'vite'

export type IconOverride = Omit<FavigenOverride, 'source'> & { readonly source?: string }

export interface BasicManifestOptions {
  readonly mode: 'basic'
  readonly name: string
  readonly shortName?: string
  readonly display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser'
  readonly backgroundColor?: string
  readonly themeColor?: string
  readonly startUrl?: string
  readonly scope?: string
  readonly appBase?: string
}

export interface HtmlFragmentOptions {
  readonly file: string
  readonly referrerFile: string
}

export interface IconUrlContext {
  readonly outputFileName: string
  readonly referrerFile: string
  readonly defaultUrl: string
}

export interface ViteFaviconsPluginOptions extends Pick<PlanOptions, 'profile' | 'ids' | 'render'> {
  readonly source?: string
  /** @deprecated Use source. */
  readonly logo?: string
  readonly targets?: Readonly<Record<string, IconOverride | undefined>>
  readonly variants?: Readonly<Partial<Record<IconRole, IconOverride>>>
  readonly outputDir?: string
  readonly rootIco?: boolean
  readonly inject?: boolean
  readonly manifest?: false | BasicManifestOptions
  readonly htmlFragment?: HtmlFragmentOptions
  readonly resolveIconUrl?: (context: IconUrlContext) => string
  readonly cache?: boolean | string
}

export interface ResolvedOptions {
  readonly config: ResolvedConfig
  readonly profile: NonNullable<PlanOptions['profile']>
  readonly ids?: PlanOptions['ids']
  readonly render?: PlanOptions['render']
  readonly targets: NonNullable<ViteFaviconsPluginOptions['targets']>
  readonly variants: NonNullable<ViteFaviconsPluginOptions['variants']>
  readonly source?: string
  readonly candidates: readonly string[]
  readonly sources: ReadonlySet<string>
  readonly outputDir: string
  readonly rootIco: boolean
  readonly inject: boolean
  readonly manifest: false | BasicManifestOptions
  readonly htmlFragment?: HtmlFragmentOptions
  readonly resolveIconUrl?: ViteFaviconsPluginOptions['resolveIconUrl']
  readonly cacheDir: string | false
}

export const pluginName = 'vite-plugin-favicon'
export const rootIcoId = 'favicon.ico'
export const manifestFile = 'manifest.webmanifest'
export const requiredAppIds = ['app.any.192', 'app.any.512'] as const

const removedOptions = {
  favicons: 'use profile, ids, render, variants, targets, or manifest',
  projectRoot: 'use Vite root for the app root, or manifest.name for the app name',
  outputPath: 'use outputDir for output paths',
  publicPath: 'use Vite base or resolveIconUrl for serving paths',
  prefix: 'use Vite base or resolveIconUrl for serving paths',
} as const

export function fail(message: string): never {
  throw new Error(`[${pluginName}] ${message}`)
}

export function outputName(value: string, label: string): string {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.split('/').some((part) =>
    !part || /[. ]$/.test(part) || /[\u0000-\u001f\u007f\\:"<>|?*#%]/u.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
  )) fail(`${label} must be a portable, output-relative path: ${JSON.stringify(value)}`)
  return value
}

function sourcePath(root: string, value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || /^\w+:\/\//.test(value)) {
    fail(`${label} must be a local image path (SVG, PNG, JPEG, or WebP).`)
  }
  return resolve(root, value)
}

function resolveOverrides<K extends string>(
  overrides: Readonly<Partial<Record<K, IconOverride>>> | undefined,
  root: string,
  label: string,
): Partial<Record<K, IconOverride>> {
  if (!overrides) return {}
  return Object.fromEntries(Object.entries<IconOverride | undefined>(overrides)
    .filter((entry): entry is [string, IconOverride] => entry[1] !== undefined)
    .map(([key, override]) => [
      key,
      {
        ...override,
        source: override.source === undefined ? undefined : sourcePath(root, override.source, `${label}.${key}.source`),
        name: override.name === undefined ? undefined : outputName(override.name, `${label}.${key}.name`),
      },
    ])) as Partial<Record<K, IconOverride>>
}

export function resolveOptions(
  input: ViteFaviconsPluginOptions | string,
  config: ResolvedConfig,
): ResolvedOptions {
  const initial = typeof input === 'string' ? { source: input } : input
  if (!initial || typeof initial !== 'object' || Array.isArray(initial)) fail('Use a source path or an options object.')
  const removed = Object.entries(removedOptions)
    .filter(([key]) => Object.hasOwn(initial, key))
    .map(([key, replacement]) => {
      const value = (initial as Record<string, unknown>)[key]
      const fields = key === 'favicons' && value && typeof value === 'object' ? Object.keys(value) : []
      return `${key}${fields.length ? ` (${fields.join(', ')})` : ''}: ${replacement}`
    })
  if (removed.length) fail(`Options removed in 2.x. ${removed.join('. ')}.`)

  const { root } = config
  const source = initial.source === undefined ? undefined : sourcePath(root, initial.source, 'source')
  const logo = initial.logo === undefined ? undefined : sourcePath(root, initial.logo, 'logo')
  if (source && logo && source !== logo) fail('source and logo specify different files. Keep source and remove logo.')

  const candidates = source || logo ? [] : [join(root, 'assets/logo.svg'), join(root, 'assets/logo.png')]
  const variants = resolveOverrides(initial.variants, root, 'variants')
  const targets = resolveOverrides(initial.targets, root, 'targets')
  const sources = new Set([...candidates, ...[source ?? logo].filter((path): path is string => !!path)])
  for (const override of [...Object.values(variants), ...Object.values(targets)]) {
    if (override?.source) sources.add(override.source)
  }

  const manifest = initial.manifest ?? false
  if (manifest !== false && (manifest.mode !== 'basic' || typeof manifest.name !== 'string' || !manifest.name.trim())) {
    fail('Use manifest: false or manifest: { mode: "basic", name: "Your app" }.')
  }
  const profile = initial.profile ?? (manifest ? 'pwa' : 'web')
  if (profile !== 'web' && profile !== 'pwa') fail('profile must be "web" or "pwa".')
  const ids = initial.ids
  if (ids !== undefined && (!Array.isArray(ids) || !ids.length)) fail('ids must contain at least one target ID.')
  if (manifest && (profile !== 'pwa' || (ids && !requiredAppIds.every((id) => ids.includes(id))))) {
    fail('A basic manifest requires the pwa profile and app.any.192 and app.any.512. Adjust profile or ids.')
  }
  if (initial.rootIco && (ids && !ids.includes(rootIcoId) || targets[rootIcoId]?.name || variants.favicon?.name)) {
    fail('rootIco requires the favicon.ico target without a name override. Change ids or disable rootIco.')
  }
  if (initial.cache !== undefined && typeof initial.cache !== 'boolean' && typeof initial.cache !== 'string') {
    fail('cache must be true, false, or a local cache directory.')
  }
  const outputDir = initial.outputDir ?? (config.build.assetsDir ? `${config.build.assetsDir}/favicons` : 'favicons')
  return {
    config, sources, candidates, profile, ids, variants, targets, manifest,
    source: source ?? logo,
    render: initial.render,
    outputDir: outputName(outputDir, 'outputDir'),
    inject: initial.inject ?? true,
    rootIco: initial.rootIco ?? false,
    resolveIconUrl: initial.resolveIconUrl,
    cacheDir: initial.cache === false ? false : resolve(root, typeof initial.cache === 'string'
      ? sourcePath(root, initial.cache, 'cache')
      : join(config.cacheDir, pluginName)),
    htmlFragment: initial.htmlFragment && {
      file: outputName(initial.htmlFragment.file, 'htmlFragment.file'),
      referrerFile: outputName(initial.htmlFragment.referrerFile, 'htmlFragment.referrerFile'),
    },
  }
}
