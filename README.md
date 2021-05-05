# Favicons Vite Plugin

<!-- cspell: disable bracketsstartstop -->

[![version](https://img.shields.io/github/v/tag/josh-hemphill/vite-plugin-favicon?sort=semver&style=?style=plastic)](https://github.com/josh-hemphill/vite-plugin-favicon/releases)
[![NPM](https://img.shields.io/static/v1?label=&message=NPM&color=informational&style=?style=plastic)](https://npmjs.org/package/vite-plugin-favicon)
[![Codecov](https://img.shields.io/codecov/c/github/josh-hemphill/vite-plugin-favicon.svg?style=?style=plastic)](https://codecov.io/gh/josh-hemphill/vite-plugin-favicon)
[![Libraries.io dependency status for latest release](https://img.shields.io/librariesio/release/npm/vite-plugin-favicon?label=Deps&style=?style=plastic)](https://libraries.io/npm/vite-plugin-favicon)
[![Rate on Openbase](https://badges.openbase.io/js/rating/vite-plugin-favicon.svg)](https://openbase.io/js/vite-plugin-favicon?utm_source=embedded&utm_medium=badge&utm_campaign=rate-badge)
[![Test](https://github.com/josh-hemphill/vite-plugin-favicon/actions/workflows/test.yml/badge.svg)](https://github.com/josh-hemphill/vite-plugin-favicon/actions/workflows/test.yml)
[![Release](https://github.com/josh-hemphill/vite-plugin-favicon/actions/workflows/release.yml/badge.svg)](https://github.com/josh-hemphill/vite-plugin-favicon/actions/workflows/release.yml)

Leverages on [favicons](https://github.com/haydenbleasel/favicons) to automatically generate your favicons for you.
And if you want to also consolidate your PWA manifest, will generate that as well with linked icons.

Partially adapted from and config compatible with [favicons-webpack-plugin](https://github.com/jantimon/favicons-webpack-plugin)

## Installation

Install the plugin with npm:

```shell
$ npm install --save-dev vite-plugin-favicon
# Or shorthand
npm i -D vite-plugin-favicon
```

## Zero Config Usage

Add your base logo as `logo.png` file to your assets folder.

Add the plugin to your vite config as follows:

```javascript
const ViteFaviconsPlugin = require('vite-plugin-favicon')
// or ESM
import { ViteFaviconsPlugin } from "module";

plugins: [
  ViteFaviconsPlugin()
]
```

## Basic Usage <!-- [<svg alt="codesandbox" xmlns="http://www.w3.org/2000/svg" width="16" height="18"><path d="M7.219 15.877V9.394l-5.73-3.208v3.696l2.624 1.48v2.78l3.106 1.735zm1.488.038l3.163-1.773v-2.845l2.642-1.49V6.16l-5.805 3.26v6.496zm5.041-11l-3.05-1.72-2.68 1.512L5.32 3.193 2.241 4.937l5.744 3.215 5.763-3.237zM0 13.513V4.53L8 0l8 4.511V13.5l-8.001 4.484L0 13.513z" fill="currentColor"/></svg>](https://codesandbox.io/s/vite-plugin-favicon-demo-uh195?file=/webpack.config.js) -->

Add the plugin to your vite config as follows:

```javascript
const ViteFaviconsPlugin = require('vite-plugin-favicon')
// or ESM
import { ViteFaviconsPlugin } from "module";

...

plugins: [
  ViteFaviconsPlugin('/path/to/logo.png') // svg works too!
]
```

The default configuration will automatically generate webapp manifest files along with
[44 different icon formats](https://github.com/josh-hemphill/vite-plugin-favicon/tree/master/test/fixtures/expected/default)
as appropriate for iOS devices, Android devices, Windows Phone and various desktop browsers out of your single `logo.png`.

> **Tip:** You might want to [fine tune](#advanced-usage) what vendors to support.

### A Note on Path Resolution

Under the hood, Vite/Rollup resolve the paths to the logo and favicons according to the following
rules:

  * If `/path/to/logo` is absolute, there is nothing to resolve and the path
specified is used as is.

  * If `./path/to/logo` is relative, it's resolved with respect to `process.cwd()`.

### HTML Injection

In combination with [Vite's html plugin hooks](https://vitejs.dev/guide/api-plugin.html#transformindexhtml) it will also inject the necessary html for you:

```html
<link rel="apple-touch-icon" sizes="57x57" href="/assets/apple-touch-icon-57x57.png">
<link rel="apple-touch-icon" sizes="60x60" href="/assets/apple-touch-icon-60x60.png">
<link rel="apple-touch-icon" sizes="72x72" href="/assets/apple-touch-icon-72x72.png">
<link rel="apple-touch-icon" sizes="76x76" href="/assets/apple-touch-icon-76x76.png">
<link rel="apple-touch-icon" sizes="114x114" href="/assets/apple-touch-icon-114x114.png">
<link rel="apple-touch-icon" sizes="120x120" href="/assets/apple-touch-icon-120x120.png">
<link rel="apple-touch-icon" sizes="144x144" href="/assets/apple-touch-icon-144x144.png">
<link rel="apple-touch-icon" sizes="152x152" href="/assets/apple-touch-icon-152x152.png">
<link rel="apple-touch-icon" sizes="167x167" href="/assets/apple-touch-icon-167x167.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon-180x180.png">
<link rel="apple-touch-icon" sizes="1024x1024" href="/assets/apple-touch-icon-1024x1024.png">
<link rel="apple-touch-startup-image" media="(device-width: 320px) and (device-height: 480px) and (-webkit-device-pixel-ratio: 1)" href="/assets/apple-touch-startup-image-320x460.png">
<link rel="apple-touch-startup-image" media="(device-width: 320px) and (device-height: 480px) and (-webkit-device-pixel-ratio: 2)" href="/assets/apple-touch-startup-image-640x920.png">
<link rel="apple-touch-startup-image" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" href="/assets/apple-touch-startup-image-640x1096.png">
<link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" href="/assets/apple-touch-startup-image-750x1294.png">
<link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 736px) and (orientation: landscape) and (-webkit-device-pixel-ratio: 3)" href="/assets/apple-touch-startup-image-1182x2208.png">
<link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 736px) and (orientation: portrait) and (-webkit-device-pixel-ratio: 3)" href="/assets/apple-touch-startup-image-1242x2148.png">
<link rel="apple-touch-startup-image" media="(device-width: 768px) and (device-height: 1024px) and (orientation: landscape) and (-webkit-device-pixel-ratio: 1)" href="/assets/apple-touch-startup-image-748x1024.png">
<link rel="apple-touch-startup-image" media="(device-width: 768px) and (device-height: 1024px) and (orientation: landscape) and (-webkit-device-pixel-ratio: 2)" href="/assets/apple-touch-startup-image-1496x2048.png">
<link rel="apple-touch-startup-image" media="(device-width: 768px) and (device-height: 1024px) and (orientation: portrait) and (-webkit-device-pixel-ratio: 1)" href="/assets/apple-touch-startup-image-768x1004.png">
<link rel="apple-touch-startup-image" media="(device-width: 768px) and (device-height: 1024px) and (orientation: portrait) and (-webkit-device-pixel-ratio: 2)" href="/assets/apple-touch-startup-image-1536x2008.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="228x228" href="/assets/coast-228x228.png">
<link rel="manifest" href="/assets/manifest.json">
<link rel="shortcut icon" href="/assets/favicon.ico">
<link rel="yandex-tableau-widget" href="/assets/yandex-browser-manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title">
<meta name="application-name">
<meta name="mobile-web-app-capable" content="yes">
<meta name="msapplication-TileColor" content="#fff">
<meta name="msapplication-TileImage" content="/assets/mstile-144x144.png">
<meta name="msapplication-config" content="/assets/browserconfig.xml">
<meta name="theme-color" content="#fff">
```

## Advanced Usage

```javascript
plugins: [
  ViteFaviconsPlugin({
    /** Your source logo (Will default to ) */
    logo?: "assets/logo.png",
    /** Inject html links/metadata. */
    inject?: true,
    /** `Favicons` configuration options
    *  - [See `favicons` documentation](https://github.com/itgalaxy/favicons) */
    favicons?: FaviconsConfig,
    /** The root of the project from which you want to load metadata */
    projectRoot?: process.cwd(),

    /** prefix is delegated to Rollup/Vite (keeping for people migrating from Webpack)
    * @deprecated */
    prefix?: string,
    /** Caching is delegated to Rollup/Vite (keeping for people migrating from Webpack)
    * @deprecated */
    cache?: boolean,
    /** Public Path is delegated to Rollup/Vite (keeping for people migrating from Webpack)
    * @deprecated */
    publicPath?: string,
    /** Output Path is delegated to Rollup/Vite (keeping for people migrating from Webpack)
    * @deprecated */
    outputPath?: string,
  })
]
```

To fine tune what icons/metadata is generated, refer to
[favicons' documentation](https://github.com/haydenbleasel/favicons#usage).

The options specified under `favicons:` are handed over as is to [favicons],
except that if `appName`, `appDescription`, `version`, `developerName` or
`developerURL` are left `undefined`, they will be automatically inferred
respectively from `name`, `description`, `version`, `author.name` and
`author.url` as defined in the nearest `package.json` if available.
And if there's no `author` it will use the first in the `contributors`.
To disable automatically retrieving metadata from `package.json`, simply set
to `null` the properties you want to omit.

### Examples

#### Basic

```javascript
const ViteFaviconsPlugin = require('vite-plugin-favicon')
// or ESM
import { ViteFaviconsPlugin } from "module";

plugins: [
  ViteFaviconsPlugin({
    logo: './src/logo.png', // svg works too!
    favicons: {
      appName: 'my-app',
      appDescription: 'My awesome App',
      developerName: 'Me',
      developerURL: null, // prevent retrieving from the nearest package.json
      background: '#ddd',
      theme_color: '#333',
      icons: {
        coast: false,
        yandex: false
      }
    }
  })
]
```

To fine tune what icons/metadata is generated, refer to
[favicons' documentation](https://github.com/haydenbleasel/favicons#usage).

#### Handling Multiple HTML Files

Vite calls the HTML transform hook for each HTML file template file you have configured in Vite, so this works automatically.

## Changelog

Take a look at the [CHANGELOG.md](https://github.com/josh-hemphill/vite-plugin-favicon/tree/latest/CHANGELOG.md).

## Contribution

You're free to contribute to this project by submitting [issues](https://github.com/josh-hemphill/vite-plugin-favicon/issues) and/or [pull requests](https://github.com/josh-hemphill/vite-plugin-favicon/pulls).

Please keep in mind that every change and feature should be covered by
tests.

## License

This project is licensed under [MIT](https://github.com/josh-hemphill/vite-plugin-favicon/blob/latest/LICENSE).

[favicons]: https://github.com/haydenbleasel/favicons

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- ALL-CONTRIBUTORS-LIST:END -->
