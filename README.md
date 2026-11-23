# Vite plugin favicon

Generate browser and Apple touch icons from one local image. The plugin serves them in Vite dev, emits them in production builds, and inserts the relevant links into Vite’s HTML. App icons and web app manifests are opt-in.

## Quick start

Install a 2.x release or a 2.x package tarball. For a published prerelease, install the exact prerelease version or the `next` tag.

```sh
npm install --save-dev ./vite-plugin-favicon-2.0.0-beta.1.tgz
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { ViteFaviconsPlugin as favicons } from 'vite-plugin-favicon'

export default defineConfig({
  plugins: [favicons({ source: './src/brand.svg' })],
})
```

Use Node 22.12 or later and Vite 7.3+ or 8.3+ within those majors. The release matrix covers Node 22 and 24, with a Node 26 compatibility job. The plugin also exports a callable CommonJS entry with `.default` and `.ViteFaviconsPlugin` aliases.

If a Vite starter already includes `<link rel="icon" href="/vite.svg">`, remove it to display generated icons. Existing favicon and Apple touch links take precedence independently. A public `favicon.ico` can coexist with the generated, namespaced icons.

`favicons()` discovers `assets/logo.svg` or `assets/logo.png` when exactly one exists. Explicit paths are relative to Vite’s `root`, and absolute local paths work for shared assets. Supply a self-contained SVG with outlined text, or a static PNG, JPEG, or WebP. Choose a square SVG or a PNG of at least 512 × 512 for app icons.

## Profiles and output

| Target IDs | Files |
| --- | --- |
| `favicon.ico`, `favicon.32`, `favicon.48`, `touch.180` | Default `web` profile. A 16/32/48 px ICO, two PNG favicons, and a 180 px Apple touch PNG. |
| `app.any.192`, `app.any.512`, `app.maskable.192`, `app.maskable.512` | Added in the `pwa` profile. App icons for a manifest owner. |

- `ids` selects specific targets from the profile. `render` sets common fit, crop, padding, background, resampling and trim. `variants` overrides a role, and `targets` overrides a target ID. Each can use separate source artwork at the role or target level.
- `outputDir` defaults to `<build.assetsDir>/favicons`, relative to the output directory. Target `name` sets the logical name. Emitted filenames include a content digest. `rootIco: true` adds the selected ICO at the stable path `favicon.ico` in place of its digested copy.
- `cache` uses Vite’s cache directory by default. Pass a custom directory or `false`. URL or output-name changes reuse cached pixel work.
- `inject: false` leaves links to the app. Emitted assets and configured manifest or fragment files remain available.
- URLs follow Vite’s `base` and the referencing HTML or manifest location. With `experimental.renderBuiltUrl`, supply a synchronous `resolveIconUrl({ outputFileName, referrerFile, defaultUrl })` that returns a static URL.

A dev source error preserves the last working icon set. On initial failure, fix the path or image in the logged diagnostic to restore generated links. Build errors fail the command. A late Vite failure can clear `dist`, so stage deployments separately when preserving the previous tree matters. Public or pipeline-owned paths that collide with generated outputs produce a diagnostic.

## App manifests and backend HTML

```ts
favicons({
  source: './src/brand.svg',
  manifest: { mode: 'basic', name: 'Shop', themeColor: '#182230' },
  variants: { favicon: { source: './src/small-mark.png', trim: true } },
})
```

The basic helper enables the `pwa` profile by default and emits one `manifest.webmanifest`. Its launch and scope default to the app root. For a full CDN base, set `manifest.appBase` to the absolute app deployment directory and serve the manifest from that origin. The helper remaps launch and scope to the local Vite mount in dev. Service workers remain the app’s responsibility.

Use `profile: 'pwa'` with the default `manifest: false` when a companion such as Vite PWA emits the manifest. A companion that needs the generated icon URLs can read `plugin.api.favigen` from the `vite-plugin-favicon` producer in `configResolved`. In dev, await `getDevIcons()`. In build, put the companion after the producer in normal plugin order. Call `resolveBuildIcons({ referrerFile, readAsset })` in its post-ordered `generateBundle` before the plugin’s post-enforced validator. Pass the output-relative path of the companion’s manifest as `referrerFile` and read the current asset bytes from the bundle. A companion can declare `plugin.api.favigenManifest = { version: 1, owner: 'name' }` to detect a competing manifest owner. See the [companion example](docs/vite-favicon-plan.md#manifest-and-backend-integrations).

For backend templates, use `inject: false` with `htmlFragment: { file: 'meta/favicon-links.html', referrerFile: 'index.html' }`. Set the referrer to the intended document path in a relative-base build. When serving a backend on a separate dev origin, proxy the managed routes to Vite or set the icon URLs’ origin in your integration.

## Upgrading from 1.0.8

| 1.x usage | 2.x equivalent |
| --- | --- |
| Default or named import, positional logo, `{ logo }`, `inject` | Still supported. Prefer `{ source }` for new configs. Paths now use Vite’s `root`. |
| `projectRoot`, inferred app name | Set Vite’s `root` for the app or set an absolute image path. Set the app name in your manifest config. |
| `favicons` renderer options | Use `profile`, `ids`, `render`, `variants` and `targets`. Keep authored assets for legacy vendor formats and startup screens. |
| `outputPath`, `publicPath`, `prefix` | Use `outputDir` for output filenames and Vite’s `base` for serving paths. |
| Automatically generated manifest or hardcoded URLs | Enable basic mode or configure a manifest owner. Use the generated links or companion API for content-digested paths. |
| Vite below 7.3 or Node below 22.12 | Stay on 1.x while upgrading the application. |

The plugin pins the maintainer’s [Favigen 1.2.0 tarball](https://github.com/josh-hemphill/favigen/releases/tag/v1.2.0) and renders with Sharp’s native optional packages. Allow installs to resolve those optional dependencies for the build machine. The legacy compatibility code in Favigen still brings deprecated transitive packages. Track that work in [issue #26](https://github.com/josh-hemphill/vite-plugin-favicon/issues/26).

## Verify locally

```sh
npm ci
npm test
npm run test:package
```
