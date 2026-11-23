import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'
import { parse } from 'parse5'
import favicons from '../dist/index.js'

const roots = new Set()
after(() => Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true }))))

const fixtureNames = process.env.VITE_UNDER_TEST ? [process.env.VITE_UNDER_TEST] : ['vite7', 'vite']
const artwork = (color = '#196ec8') => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect x="22" y="22" width="468" height="468" rx="64" fill="${color}"/></svg>`
const html = (head = '', body = 'Shop') => `<!doctype html><html><head><title>Shop</title><!-- template survives -->${head}</head><body>${body}</body></html>`

function links(page, rel) {
  const result = []
  function visit(node) {
    if (node.tagName === 'link') {
      const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]))
      if (!rel || attrs.rel.split(/\s+/).includes(rel)) result.push(attrs)
    }
    node.childNodes?.forEach(visit)
  }
  visit(parse(page))
  return result
}

async function fixture(_t, files = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vite-favicon-tests-')))
  roots.add(root)
  const write = async (file, contents) => {
    const path = join(root, file)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
  for (const [file, contents] of Object.entries({ 'index.html': html(), 'assets/logo.svg': artwork(), ...files })) {
    if (contents !== undefined) await write(file, contents)
  }
  return { root, write }
}

function setup(vite, root, overrides = {}) {
  return {
    root, configFile: false, logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    preview: { host: '127.0.0.1', port: 0 },
    ...overrides,
  }
}

async function http(vite, config, kind, t) {
  const server = kind === 'dev' ? await vite.createServer(config) : await vite.preview(config)
  if (kind === 'dev') {
    t.after(() => server.close())
    await server.listen()
  } else {
    t.after(() => new Promise((done) => {
      server.httpServer.close(done)
      server.httpServer.closeAllConnections()
    }))
  }
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port
  const fetchPath = (url, options) => fetch(new URL(url, origin), options)
  return { server, origin, fetchPath }
}

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

function verifyIcon(bytes, tag) {
  if (tag.type === 'image/png') {
    assert.equal(pngDimensions(bytes).join('x'), tag.sizes)
  } else {
    assert.equal(tag.type, 'image/vnd.microsoft.icon')
    assert.equal(bytes.readUInt16LE(2), 1)
    assert.equal(bytes.readUInt16LE(4), 3)
    assert.deepEqual([bytes[6], bytes[22], bytes[38]], [16, 32, 48])
  }
}

async function followIcons(fetchPath, pagePath) {
  const response = await fetchPath(pagePath)
  assert.equal(response.status, 200)
  const page = await response.text()
  assert.ok(page.includes('<!-- template survives -->'))
  const tags = links(page).filter(({ rel }) => ['icon', 'apple-touch-icon'].includes(rel))
  assert.equal(tags.length, 4)
  for (const icon of tags) {
    const image = await fetchPath(new URL(icon.href, response.url))
    assert.equal(image.status, 200)
    assert.match(image.headers.get('content-type'), /^image\//)
    verifyIcon(Buffer.from(await image.arrayBuffer()), icon)
  }
  return { page, tags }
}

async function eventually(check, message, limit = 5500) {
  const end = Date.now() + limit
  while (Date.now() < end) {
    const value = await check()
    if (value) return value
    await delay(55)
  }
  assert.fail(message)
}

function emitted(result, file) {
  return result.output.find(({ fileName }) => fileName === file)
}

for (const name of fixtureNames) {
  const vite = await import(name)
  const major = `Vite ${vite.version}`

  test(`${major} builds and previews web icons at root, subpath and nested relative base`, async (t) => {
    for (const base of ['/', '/shop/', './']) {
      const { root } = await fixture(t, { 'help/topics/index.html': html() })
      const config = setup(vite, root, {
        base, plugins: [favicons({ outputDir: 'brand/icons' })],
        build: { rollupOptions: { input: ['index.html', 'help/topics/index.html'].map((file) => join(root, file)) } },
      })
      await vite.build(config)
      const preview = await http(vite, config, 'preview', t)
      const page = base === './' ? '/help/topics/index.html' : `${base}help/topics/index.html`
      const { tags } = await followIcons(preview.fetchPath, page)
      assert.ok(tags.every(({ href }) => href.startsWith(base === './' ? '../../brand/icons/' : base + 'brand/icons/')))
      await followIcons(preview.fetchPath, base === './' ? '/index.html' : base)
    }
  })

  test(`${major} preserves authored links and public assets through a 1.x config migration`, async (t) => {
    const { root, write } = await fixture(t, {
      'index.html': html('<link rel="icon" href="/vite.svg"><link rel="manifest" href="/app.webmanifest">'),
      'public/vite.svg': artwork('#993322'),
      'public/app.webmanifest': '{"name":"Original"}',
      'public/favicon.ico': 'authored.ico',
    })
    const old = setup(vite, root, { plugins: [favicons({ logo: './assets/logo.svg' })] })
    await vite.build(old)
    const built = await readFile(join(root, 'dist/index.html'), 'utf8')
    assert.deepEqual(links(built, 'icon').map((attrs) => attrs.href), ['/vite.svg'])
    assert.deepEqual(links(built, 'manifest').map((attrs) => attrs.href), ['/app.webmanifest'])
    assert.equal(links(built, 'apple-touch-icon').length, 1)
    assert.equal(await readFile(join(root, 'dist/favicon.ico'), 'utf8'), 'authored.ico')
    await write('index.html', html('<link rel="manifest" href="/app.webmanifest">'))
    await vite.build(old)
    assert.equal(links(await readFile(join(root, 'dist/index.html'), 'utf8'), 'icon').length, 3)
    await assert.rejects(() => vite.build(setup(vite, root, {
      plugins: [favicons({ projectRoot: root, favicons: { appName: 'Shop' }, outputPath: 'icons' })],
    })), /favicons \(appName\).*manifest.*projectRoot.*outputPath/)
  })

  test(`${major} builds a React client entry with the configured Vite root`, async (t) => {
    const { root } = await fixture(t, {
      'site/index.html': html('', '<div id="root"></div><script type="module" src="/app.jsx"></script>'),
      'site/art/logo.svg': artwork(),
      'site/app.jsx': "import React from 'react'; import { createRoot } from 'react-dom/client'; createRoot(document.querySelector('#root')).render(<h1>Shop</h1>);",
    })
    const config = setup(vite, join(root, 'site'), {
      plugins: [favicons('art/logo.svg')],
      resolve: { alias: {
        'react/jsx-runtime': fileURLToPath(import.meta.resolve('react/jsx-runtime')),
        'react-dom/client': fileURLToPath(import.meta.resolve('react-dom/client')),
        react: fileURLToPath(import.meta.resolve('react')),
      } },
    })
    await vite.build(config)
    const preview = await http(vite, config, 'preview', t)
    const { page } = await followIcons(preview.fetchPath, '/')
    assert.match(page, /type="module".*src="\/assets\/index-/)
  })

  test(`${major} dev validates requests, recovers missing and corrupt artwork and keeps old URLs alive`, { timeout: 20000 }, async (t) => {
    const { root, write } = await fixture(t, { 'assets/logo.svg': undefined })
    const plugins = favicons({ rootIco: true })
    const app = await http(vite, setup(vite, root, { base: '/shop/', plugins: [plugins] }), 'dev', t)
    const api = plugins[0].api.favigen
    assert.equal((await app.fetchPath('/shop/favicon.ico', { method: 'HEAD' })).status, 404)
    assert.equal(await api.getDevIcons(), undefined)
    assert.equal(links(await (await app.fetchPath('/shop/')).text()).length, 0)
    const reloads = []
    const send = app.server.ws.send.bind(app.server.ws)
    app.server.ws.send = (...args) => {
      if (args[0]?.type === 'full-reload' && args[0].path === '*') reloads.push(args[0])
      return send(...args)
    }

    await write('assets/logo.svg', artwork())
    const initial = await eventually(() => api.getDevIcons(), 'creating the missing source did not publish icons')
    const { tags } = await followIcons(app.fetchPath, '/shop/')
    const png = tags.find(({ sizes }) => sizes === '32x32').href
    const response = await app.fetchPath(png)
    const original = Buffer.from(await response.arrayBuffer())
    const etag = response.headers.get('etag')
    const head = await app.fetchPath(png, { method: 'HEAD' })
    assert.equal(head.headers.get('content-length'), String(original.length))
    assert.equal((await head.arrayBuffer()).byteLength, 0)
    assert.equal((await app.fetchPath(png + '?cache=test', { headers: { 'If-None-Match': 'W/' + etag } })).status, 304)
    assert.match(response.headers.get('cache-control'), /immutable/)
    assert.equal((await app.fetchPath('/shop/favicon.ico')).headers.get('cache-control'), 'no-cache')

    await write('assets/logo.svg', 'corrupt')
    await delay(450)
    assert.equal((await api.getDevIcons()).revision, initial.revision)
    assert.deepEqual(Buffer.from(await (await app.fetchPath(png)).arrayBuffer()), original)
    const before = reloads.length
    await write('assets/replacement.svg', artwork('#b52372'))
    await rename(join(root, 'assets/replacement.svg'), join(root, 'assets/logo.svg'))
    const updated = await eventually(async () => {
      const current = await api.getDevIcons()
      return current?.revision !== initial.revision && current
    }, 'atomic replacement did not update the publication')
    assert.equal(reloads.length, before + 1)
    assert.notEqual(updated.icons.find(({ id }) => id === 'favicon.32').url, png)
    assert.equal((await app.fetchPath(png)).status, 200)
  })

  test(`${major} honors changing public ownership for stable dev routes`, { timeout: 15000 }, async (t) => {
    const { root, write } = await fixture(t)
    const plugins = favicons({ rootIco: true, manifest: { mode: 'basic', name: 'Shop' },
      htmlFragment: { file: 'meta/icons.html', referrerFile: 'index.html' } })
    const app = await http(vite, setup(vite, root, { plugins: [plugins] }), 'dev', t)
    assert.equal((await app.fetchPath('/manifest.webmanifest')).status, 200)
    assert.match(await (await app.fetchPath('/meta/icons.html')).text(), /rel="manifest"/)
    for (const [file, bytes] of [['favicon.ico', 'existing icon'], ['manifest.webmanifest', '{"name":"Existing"}'], ['meta/icons.html', 'existing fragment']]) {
      await write('public/' + file, bytes)
      await eventually(async () => {
        const response = await app.fetchPath('/' + file)
        return response.ok && await response.text() === bytes
      }, 'Vite did not serve the authored file: ' + file)
    }
    const overridden = await plugins[0].api.favigen.getDevIcons()
    assert.ok(overridden.icons.every(({ outputFileName }) => outputFileName !== 'favicon.ico'))
    assert.equal(links(await (await app.fetchPath('/')).text(), 'manifest').length, 0)
    await rm(join(root, 'public'), { recursive: true })
    await eventually(async () => {
      const icons = await plugins[0].api.favigen.getDevIcons()
      return icons.icons.some(({ outputFileName }) => outputFileName === 'favicon.ico')
    }, 'removing public files did not restore the alias')
    assert.equal((await (await app.fetchPath('/manifest.webmanifest')).json()).name, 'Shop')
    assert.match(await (await app.fetchPath('/meta/icons.html')).text(), /rel="manifest"/)
  })

  test(`${major} builds a companion-owned nested manifest from the current output bytes`, async (t) => {
    const { root } = await fixture(t, { 'help/topics/index.html': html() })
    const manifestPath = 'meta/app.webmanifest'
    let api
    const companion = {
      name: 'companion-fixture',
      api: { favigenManifest: { version: 1, owner: 'fixture' } },
      configResolved(config) {
        api = config.plugins.find(({ name }) => name === 'vite-plugin-favicon').api.favigen
        assert.equal(api.version, 1)
        assert.throws(() => api.resolveBuildIcons({ readAsset: () => undefined, referrerFile: manifestPath }), /generateBundle/)
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/' + manifestPath) return next()
          void api.getDevIcons().then((publication) => {
            const icons = publication?.icons.filter(({ role }) => role === 'app').map(({ url }) => url)
            res.setHeader('Content-Type', 'application/manifest+json')
            res.end(JSON.stringify({ icons }))
          }, next)
        })
      },
      generateBundle: {
        order: 'post',
        handler(_, bundle) {
          const records = api.resolveBuildIcons({
            referrerFile: manifestPath,
            readAsset: (file) => bundle[file]?.type === 'asset' ? bundle[file].source : undefined,
          })
          const icons = records.icons.filter(({ role }) => role === 'app')
          assert.equal(icons.length, 4)
          this.emitFile({ type: 'asset', fileName: manifestPath, source: JSON.stringify({ icons }) })
          for (const file of ['index.html', 'help/topics/index.html']) {
            const href = file === 'index.html' ? './' + manifestPath : '../../' + manifestPath
            bundle[file].source = bundle[file].source.toString().replace('</head>', `<link rel="manifest" href="${href}"></head>`)
          }
        },
      },
    }
    const config = setup(vite, root, {
      base: './',
      plugins: [favicons({ profile: 'pwa' }), companion],
      build: { rollupOptions: { input: [join(root, 'index.html'), join(root, 'help/topics/index.html')] } },
    })
    const dev = await http(vite, config, 'dev', t)
    const first = await (await dev.fetchPath('/' + manifestPath)).json()
    assert.equal(first.icons.length, 4)
    assert.equal((await dev.fetchPath(first.icons[0])).status, 200)
    await vite.build(config)
    const preview = await http(vite, config, 'preview', t)
    const page = await preview.fetchPath('/help/topics/index.html')
    const [link] = links(await page.text(), 'manifest')
    const metadata = await preview.fetchPath(new URL(link.href, page.url))
    const manifest = await metadata.json()
    for (const icon of manifest.icons) {
      assert.match(icon.url, /^\.\.\/assets\/favicons\//)
      const result = await preview.fetchPath(new URL(icon.url, metadata.url))
      assert.equal(result.status, 200)
      const bytes = Buffer.from(await result.arrayBuffer())
      assert.deepEqual(pngDimensions(bytes), [icon.sizes[0].width, icon.sizes[0].height])
      assert.equal(createHash('sha256').update(bytes).digest('hex'), icon.digest)
    }
  })

  test(`${major} joins CDN icons to same-origin launch and scope and serves the backend fragment`, async (t) => {
    const { root } = await fixture(t, { 'entry.js': 'console.log("client app")' })
    const buildOptions = (appBase, startUrl) => ({
      rootIco: true, inject: false, htmlFragment: { file: 'meta/icons.html', referrerFile: 'help/index.html' },
      manifest: { mode: 'basic', name: 'Shop', appBase, startUrl, scope: './' },
    })
    // The dev route is exercised before any HTML request.
    const dev = await http(vite, setup(vite, root, {
      base: 'https://cdn.example/brand/', plugins: [favicons(buildOptions('https://app.example/shop', './custom?source=launcher#top'))],
    }), 'dev', t)
    assert.equal((await dev.fetchPath('/brand/favicon.ico')).status, 200)
    const manifestRes = await dev.fetchPath('/brand/manifest.webmanifest')
    assert.equal(manifestRes.status, 200)
    const local = await manifestRes.json()
    assert.equal(local.start_url, '/brand/custom?source=launcher#top')
    assert.equal(local.scope, '/brand/')
    assert.equal((await dev.fetchPath(local.start_url)).status, 200)
    assert.equal((await dev.fetchPath('/shop/custom')).status, 404)
    for (const { src } of local.icons) assert.equal((await dev.fetchPath(src)).status, 200)

    const proxy = createHttpServer((req, res) => {
      void dev.fetchPath(req.url).then(async (result) => {
        res.writeHead(result.status, { 'Content-Type': result.headers.get('content-type') ?? 'text/plain' })
        res.end(Buffer.from(await result.arrayBuffer()))
      }).catch((error) => res.destroy(error))
    })
    await new Promise((done) => proxy.listen(0, '127.0.0.1', done))
    t.after(() => new Promise((done) => { proxy.close(done); proxy.closeAllConnections() }))
    const origin = 'http://127.0.0.1:' + proxy.address().port
    const fragment = await (await fetch(origin + '/brand/meta/icons.html')).text()
    for (const { href } of links(fragment)) assert.equal((await fetch(origin + href)).status, 200)

    const configs = setup(vite, root, {
      base: 'https://cdn.example/brand/',
      plugins: [favicons(buildOptions('https://app.example/shop/', './custom?source=launcher#top'))],
      build: { write: false, rollupOptions: { input: join(root, 'entry.js') } },
    })
    const result = await vite.build(configs)
    const published = JSON.parse(emitted(result, 'manifest.webmanifest').source)
    const exported = links(emitted(result, 'meta/icons.html').source)
    assert.equal(exported.find(({ rel }) => rel === 'manifest').href, '/shop/manifest.webmanifest')
    assert.equal(published.start_url, '/shop/custom?source=launcher#top')
    assert.equal(published.scope, '/shop/')
    for (const { src } of published.icons) {
      const url = new URL(src)
      assert.equal(url.origin, 'https://cdn.example')
      assert.ok(emitted(result, url.pathname.replace('/brand/', '')))
    }
    await assert.rejects(() => vite.build({
      ...configs, plugins: [favicons(buildOptions('https://app.example/shop/', '/shop-other/custom'))],
    }), /manifest.startUrl.*within the app mount/)
  })

  test(`${major} detects output, public, and late HTML collisions without writing output`, async (t) => {
    const { root, write } = await fixture(t, { 'public/Favicon.ico': 'existing' })
    const build = (...plugins) => vite.build(setup(vite, root, { plugins, build: { write: false } }))
    await assert.rejects(() => build(favicons({ rootIco: true })), /conflicts with public file/)
    await assert.rejects(() => build(favicons({ rootIco: true, ids: ['favicon.32'] })), /rootIco requires the favicon.ico target/)
    await rm(join(root, 'public'), { recursive: true })
    const mutate = (name, handler) => ({ name, generateBundle: { order: 'post', handler } })
    await assert.rejects(() => build(favicons({ rootIco: true }), mutate('duplicate-asset', function () {
      this.emitFile({ type: 'asset', fileName: 'favicon.ico', source: 'replacement' })
    })), /overwrites a previously emitted file|removed or replaced/)
    await assert.rejects(() => build(favicons({ manifest: { mode: 'basic', name: 'Shop' } }), mutate('duplicate-link', (_, bundle) => {
      bundle['index.html'].source = bundle['index.html'].source.toString().replace('</head>', '<link rel="manifest" href="/other.webmanifest"></head>')
    })), /manifest link.*changed or was duplicated/)
    await write('index.html', html('<base href="https://other.example/">'))
    await assert.rejects(() => build(favicons()), /base href.*changes generated URLs/)
  })

  test(`${major} verifies each output, keeps cache entries on rename and skips SSR and library builds`, async (t) => {
    const { root } = await fixture(t, { 'entry.js': 'export const value = 42' })
    const build = (plugins, build = {}, base = '/') =>
      vite.build(setup(vite, root, { plugins, build: { write: false, ...build }, base }))
    const first = await build([favicons({ cache: '.icons-cache', ids: ['favicon.32'] })])
    const [original] = links(emitted(first, 'index.html').source)
    const entries = await readdir(join(root, '.icons-cache/favigen-v1'))
    assert.equal(entries.length, 1)
    const multi = await build([favicons({
      cache: '.icons-cache', ids: ['favicon.32'], targets: { 'favicon.32': { name: 'new name.png' } },
    })], { rollupOptions: { output: [{ dir: join(root, 'one') }, { dir: join(root, 'two') }] } }, '/shop/')
    assert.equal(multi.length, 2)
    for (const result of multi) {
      const [tag] = links(emitted(result, 'index.html').source)
      assert.match(tag.href, /^\/shop\/assets\/favicons\/new%20name\./)
      const decode = (path) => decodeURIComponent(path.replace(/^\/(shop\/)?/, ''))
      assert.deepEqual(emitted(result, decode(tag.href)).source, emitted(first, decode(original.href)).source)
    }
    assert.deepEqual(await readdir(join(root, '.icons-cache/favigen-v1')), entries)
    const variant = join(root, 'mark.svg')
    await writeFile(variant, artwork('#af0028'))
    const config = { cache: '.icons-cache', ids: ['favicon.32', 'touch.180'], targets: { 'favicon.32': { source: variant } } }
    const before = links(emitted(await build([favicons(config)]), 'index.html').source)
    await writeFile(variant, artwork('#005dc8'))
    const after = links(emitted(await build([favicons(config)]), 'index.html').source)
    assert.notEqual(after.find(({ rel }) => rel === 'icon').href, before.find(({ rel }) => rel === 'icon').href)
    assert.equal(after.find(({ rel }) => rel === 'apple-touch-icon').href, before.find(({ rel }) => rel === 'apple-touch-icon').href)
    const plugins = () => [favicons({ source: 'missing.svg' })]
    for (const config of [{ ssr: 'entry.js' }, { lib: { entry: 'entry.js', formats: ['es'] } }]) {
      const result = await build(plugins(), config)
      for (const output of [result].flat()) {
        assert.ok(output.output.every(({ fileName }) => !fileName.includes('favicons')))
      }
    }
  })

  test(`${major} build watch recovers after deleting and recreating a source`, { timeout: 22000 }, async (t) => {
    const { root, write } = await fixture(t)
    const watcher = await vite.build(setup(vite, root, {
      plugins: [favicons({ ids: ['favicon.32'] })],
      // Exercise rebuilds with deterministic file detection on hosted VMs.
      build: { watch: { buildDelay: 25, chokidar: { persistent: false, usePolling: true, interval: 50 } } },
    }))
    t.after(() => watcher.close())
    const events = []
    watcher.on('event', (event) => { events.push(event) })
    const waitFor = (code, from = 0) => eventually(
      () => events.slice(from).find((event) => event.code === code), `watch never emitted ${code}`, 9500,
    )
    const first = await waitFor('END')
    const original = links(await readFile(join(root, 'dist/index.html'), 'utf8'))[0].href
    const failedAt = events.indexOf(first) + 1
    await rm(join(root, 'assets/logo.svg'))
    const failure = await waitFor('ERROR', failedAt)
    assert.match(String(failure.error), /[Aa]rtwork|default logo/)
    assert.equal(links(await readFile(join(root, 'dist/index.html'), 'utf8'))[0].href, original)
    await write('assets/logo.svg', artwork('#b32633'))
    const rebuilt = await waitFor('BUNDLE_END', events.indexOf(failure) + 1)
    await waitFor('END', events.indexOf(rebuilt) + 1)
    const next = links(await readFile(join(root, 'dist/index.html'), 'utf8'))[0].href
    assert.notEqual(next, original)
    assert.ok((await readFile(join(root, 'dist', next.slice(1)))).length > 64)
  })

  test(`${major} coexists with vite-plugin-pwa as the only manifest owner`, async (t) => {
    const { VitePWA } = await import('vite-plugin-pwa')
    const { root } = await fixture(t)
    const result = await vite.build(setup(vite, root, {
      plugins: [favicons({ profile: 'pwa' }), VitePWA({
        registerType: 'autoUpdate', injectRegister: false,
        manifest: { name: 'Owned by VitePWA', short_name: 'Shop' },
        workbox: { globPatterns: [], sourcemap: false },
        selfDestroying: true,
      })],
    }))
    assert.ok(result.output.some(({ fileName }) => fileName.endsWith('icon-192.png') || /icon-192\./.test(fileName)))
    const page = await readFile(join(root, 'dist/index.html'), 'utf8')
    assert.equal(links(page, 'manifest').length, 1)
    assert.equal(JSON.parse(await readFile(join(root, 'dist/manifest.webmanifest'), 'utf8')).name, 'Owned by VitePWA')
    const claimant = (owner) => ({ name: owner, api: { favigenManifest: { owner, version: 1 } } })
    await assert.rejects(() => vite.build(setup(vite, root, {
      plugins: [favicons(), claimant('one'), claimant('two')],
    })), /Competing manifest owners: one, two/)
  })
}
