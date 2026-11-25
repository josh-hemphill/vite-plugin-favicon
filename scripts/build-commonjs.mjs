import { writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.cjs',
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  packages: 'external',
  bundle: true,
  sourcemap: true,
  footer: {
    js: 'module.exports = Object.assign(module.exports.default, module.exports);',
  },
})

await writeFile('dist/index.d.cts', `
import type * as esm from './index.js' with { 'resolution-mode': 'import' }

declare const favicon: typeof esm.ViteFaviconsPlugin & {
  default: typeof esm.ViteFaviconsPlugin
  ViteFaviconsPlugin: typeof esm.ViteFaviconsPlugin
}

declare namespace favicon {
  export type ViteFaviconsPluginOptions = esm.ViteFaviconsPluginOptions
  export type ViteFavigenApi = esm.ViteFavigenApi
  export type ViteFavigenManifestOwner = esm.ViteFavigenManifestOwner
  export type IconPublication = esm.IconPublication
  export type PublishedIcon = esm.PublishedIcon
  export type BasicManifestOptions = esm.BasicManifestOptions
  export type HtmlFragmentOptions = esm.HtmlFragmentOptions
  export type IconOverride = esm.IconOverride
  export type IconUrlContext = esm.IconUrlContext
}

export = favicon
`.trimStart())
