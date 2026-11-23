import type { IconPublication } from 'favigen'
import type { Plugin } from 'vite'
import { createDev } from './dev.js'
import { createGenerator, digest, watchPaths } from './generation.js'
import type { Generation } from './generation.js'
import { htmlFragment, injectLinks, verifyLinks } from './html.js'
import { fail, manifestFile, outputName, pluginName, resolveOptions } from './options.js'
import type { ResolvedOptions, ViteFaviconsPluginOptions } from './options.js'
import { bindGeneration, createManifest, documentUrl, publicCollision } from './publication.js'
import type { ManifestOutput } from './publication.js'

export type { IconPublication, PublishedIcon } from 'favigen'
export type { BasicManifestOptions, HtmlFragmentOptions, IconOverride, IconUrlContext, ViteFaviconsPluginOptions } from './options.js'

export interface ViteFavigenApi {
  readonly version: 1
  getDevIcons(): Promise<IconPublication | undefined>
  resolveBuildIcons(context: {
    readAsset: (fileName: string) => string | Uint8Array | undefined
    referrerFile: string
  }): IconPublication
}

export interface ViteFavigenManifestOwner {
  readonly version: 1
  readonly owner: string
}

const validatorName = `${pluginName}:validate-output`

interface ActiveOutput {
  readonly generation: Generation
  readonly expected: ReadonlyMap<string, string>
  readonly links: ReadonlyMap<string, ReturnType<typeof injectLinks>['tags']>
}

export function ViteFaviconsPlugin(input: ViteFaviconsPluginOptions | string = {}): Plugin[] {
  let requestedBase: string | undefined
  let options: ResolvedOptions
  let manifest: ManifestOutput | undefined
  let generate: ReturnType<typeof createGenerator>
  let dev: ReturnType<typeof createDev> | undefined
  let activeGeneration: Generation | undefined
  let output: ActiveOutput | undefined
  let claims = new Set<string>()
  const warnings = new Set<string>()

  function warn(message: string): void {
    if (warnings.has(message)) return
    warnings.add(message)
    options.config.logger.warn(message.startsWith(`[${pluginName}]`) ? message : `[${pluginName}] ${message}`)
  }

  const api: ViteFavigenApi = {
    version: 1,
    async getDevIcons() {
      return dev?.getIcons()
    },
    resolveBuildIcons({ readAsset, referrerFile }) {
      const order = 'Call resolveBuildIcons in a post-ordered generateBundle hook after vite-plugin-favicon and before its output validator.'
      if (!output) fail(order)
      const file = outputName(referrerFile, 'referrerFile')
      for (const icon of output.generation.icons) {
        const bytes = readAsset(icon.fileName)
        if (bytes === undefined || digest(bytes) !== icon.digest) {
          fail(`Missing or changed output ${icon.fileName}. ${order}`)
        }
      }
      return bindGeneration(options, output.generation, 'build', file)
    },
  }

  const producer: Plugin = {
    name: pluginName,
    api: { favigen: api },
    config: {
      order: 'post',
      handler(config) { requestedBase = config.base },
    },
    configResolved(config) {
      if (config.plugins.filter((plugin) => plugin.name === pluginName).length > 1) {
        fail('Configure one favicon plugin instance per Vite project.')
      }
      options = resolveOptions(input, config)
      const owners = config.plugins.flatMap((plugin) => {
        const claim = plugin.api?.favigenManifest as ViteFavigenManifestOwner | undefined
        if (!claim) return []
        if (claim.version !== 1 || typeof claim.owner !== 'string' || !claim.owner.trim()) {
          fail(`${plugin.name} has an invalid favigenManifest claim. Use version: 1 and an owner name.`)
        }
        return [claim.owner]
      })
      if (owners.length > 1 || (owners.length && options.manifest)) {
        fail(`Competing manifest owners: ${[...owners, ...(options.manifest ? [pluginName] : [])].join(', ')}. Choose one and disable basic mode when a companion owns the manifest.`)
      }
      if (config.command === 'build' && !config.build.lib && !config.build.ssr
        && config.experimental.renderBuiltUrl && !options.resolveIconUrl) {
        fail('Configure resolveIconUrl for static icon URLs when using experimental.renderBuiltUrl, or remove that Vite option.')
      }
      if (options.manifest && options.htmlFragment?.file.toLowerCase() === manifestFile) {
        fail(`htmlFragment.file conflicts with the built-in ${manifestFile}. Choose another path.`)
      }
      if (options.rootIco && options.htmlFragment?.file.toLowerCase() === 'favicon.ico') {
        fail('htmlFragment.file conflicts with the root ICO. Choose another path.')
      }
      manifest = !config.build.lib && !config.build.ssr ? createManifest(options, requestedBase) : undefined
      generate = createGenerator(options, warn)
    },
    configureServer(server) {
      dev = createDev(options, server, generate, manifest, warn)
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, context) {
        if (context.server && dev) return dev.transform(html, context.originalUrl ?? context.path)
      },
    },
    async buildStart() {
      if (options.config.command !== 'build' || this.environment.config.consumer !== 'client'
        || this.environment.config.build.lib || this.environment.config.build.ssr) return
      activeGeneration = undefined
      output = undefined
      claims.clear()
      for (const path of await watchPaths(options.sources)) this.addWatchFile(path)
      activeGeneration = await generate()
    },
    onLog(level, log) {
      if (level !== 'warn' || log.code !== 'FILE_NAME_CONFLICT') return
      const file = /^The emitted file "(.*)" overwrites a previously emitted file of the same name\.$/.exec(log.message)?.[1]
      if (file && claims.has(file.toLowerCase())) this.error(log)
    },
    generateBundle: {
      order: 'post',
      async handler(_outputOptions, bundle) {
        if (!activeGeneration || this.environment.config.consumer !== 'client'
          || this.environment.config.build.lib || this.environment.config.build.ssr) return
        output = undefined
        claims = new Set()
        const generation = activeGeneration
        const extras: { fileName: string; source: string }[] = []
        const pending = new Map<string, string>()
        const links = new Map<string, ReturnType<typeof injectLinks>['tags']>()
        const occupied = new Set(Object.keys(bundle).map((file) => file.toLowerCase()))
        const { publicDir } = options.config
        const copyPublic = this.environment.config.build.copyPublicDir
        const files = generation.icons.map(({ fileName }) => fileName)
        if (manifest) files.push(manifestFile)
        if (options.htmlFragment) files.push(options.htmlFragment.file)
        for (const file of files) {
          const key = file.toLowerCase()
          const overlaps = (path: string) => path === key || path.startsWith(key + '/') || key.startsWith(path + '/')
          if ([...occupied, ...claims].some(overlaps)) {
            fail(`Output path ${file} is already claimed. Choose another outputDir or name, or disable the conflicting output.`)
          }
          if (publicDir && copyPublic !== false) {
            const conflict = await publicCollision(publicDir, file)
            if (conflict) fail(`Output path ${file} conflicts with public file ${conflict}. Rename the generated output or move the public file.`)
          }
          claims.add(key)
        }

        // These names are explicit; verify each bundler retains them before binding URLs.
        for (const { fileName, bytes } of generation.icons) {
          const reference = this.emitFile({ type: 'asset', fileName, source: bytes })
          if (this.getFileName(reference) !== fileName) fail(`The bundler renamed the claimed icon ${fileName}.`)
        }
        if (manifest) {
          extras.push({ fileName: manifestFile, source: manifest.build(bindGeneration(options, generation, 'build', manifestFile)) })
        }
        if (options.htmlFragment) {
          const { file, referrerFile } = options.htmlFragment
          extras.push({ fileName: file, source: htmlFragment(
            bindGeneration(options, generation, 'build', referrerFile), manifest?.href(referrerFile),
          ) })
        }
        if (options.inject) {
          for (const [file, entry] of Object.entries(bundle)) {
            if (!file.endsWith('.html') || entry.type !== 'asset') continue
            const source = Buffer.from(entry.source).toString()
            const result = injectLinks(source, bindGeneration(options, generation, 'build', file),
              manifest?.href(file), file, manifest?.documentUrl(file) ?? documentUrl(options, file), 'build', warn)
            if (result.tags.length) {
              pending.set(file, result.html)
              links.set(file, result.tags)
            }
          }
        }
        for (const [file, source] of pending) {
          const entry = bundle[file]
          if (entry?.type === 'asset') entry.source = source
        }
        for (const { fileName, source } of extras) {
          const reference = this.emitFile({ type: 'asset', fileName, source })
          if (this.getFileName(reference) !== fileName) fail(`The bundler renamed the claimed file ${fileName}.`)
        }
        output = {
          generation,
          links,
          expected: new Map([
            ...generation.icons.map(({ fileName, digest }) => [fileName, digest] as const),
            ...extras.map(({ fileName, source }) => [fileName, digest(source)] as const),
          ]),
        }
      },
    },
    closeBundle() {
      if (dev && this.environment.mode === 'dev' && this.environment.name === 'client') {
        dev.close()
        dev = undefined
      }
    },
  }

  const validator: Plugin = {
    name: validatorName,
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_outputOptions, bundle) {
        if (!output || this.environment.config.consumer !== 'client') return
        const completed = output
        output = undefined
        for (const [name, hash] of completed.expected) {
          const entry = bundle[name]
          if (entry?.type !== 'asset' || hash !== digest(entry.source)) {
            fail(`Claimed output ${name} was removed or replaced by another output writer.`)
          }
          if (Object.keys(bundle).some((file) => file !== name && (
            file.toLowerCase() === name.toLowerCase()
            || file.toLowerCase().startsWith(name.toLowerCase() + '/')
            || name.toLowerCase().startsWith(file.toLowerCase() + '/')
          ))) fail(`Claimed output ${name} conflicts with another output filename.`)
        }
        for (const [file, links] of completed.links) {
          const entry = bundle[file]
          if (entry?.type !== 'asset') fail(`HTML output ${file} with generated links was removed by another output writer.`)
          verifyLinks(Buffer.from(entry.source).toString(), file, links)
        }
      },
    },
  }

  return [producer, validator]
}

export default ViteFaviconsPlugin
