import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const tmp = await mkdtemp(join(tmpdir(), 'vite-plugin-favicon-package-'))
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run with npm run test:package')
const npmEnv = { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' }

function run(args, cwd = tmp, capture = false, env = process.env) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed. ${result.stderr ?? result.error ?? ''}`)
  return result.stdout
}

try {
  const sourcePackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const tarballUrl = sourcePackage.dependencies.favigen
  const response = await fetch(tarballUrl, { signal: AbortSignal.timeout(30000) })
  assert.ok(response.ok, `Favigen tarball download failed: ${response.status}`)
  const release = Buffer.from(await response.arrayBuffer())
  assert.equal(createHash('sha256').update(release).digest('hex'),
    'e50ee9958680cb3b79ef11eb878bfc7f6c7b694a8b9bbccedbaa7451856f41f6')
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
  assert.equal(lock.packages['node_modules/favigen'].integrity,
    'sha512-' + createHash('sha512').update(release).digest('base64'))

  const [pack] = JSON.parse(run([npm, 'pack', '--json', '--pack-destination', tmp], root, true, npmEnv))
  assert.ok(pack.files.some(({ path }) => path === 'dist/index.d.cts'))
  const vite = process.env.VITE_PACKAGE_VERSION ?? '8.3.8'
  const install = { private: true, dependencies: { 'vite-plugin-favicon': `file:./${pack.filename}`, vite } }
  await writeFile(join(tmp, 'package.json'), JSON.stringify(install))
  const manager = process.env.PACKAGE_MANAGER ?? 'npm'
  if (manager === 'npm') {
    run([npm, 'install'], tmp, false, npmEnv)
    const consumerLock = JSON.parse(await readFile(join(tmp, 'package-lock.json'), 'utf8'))
    assert.equal(consumerLock.packages['node_modules/favigen'].resolved, tarballUrl)
    run([npm, 'ci'], tmp, false, npmEnv)
  } else {
    const managers = {
      pnpm: { tool: 'pnpm@10.32.1', lockFile: 'pnpm-lock.yaml', frozen: '--frozen-lockfile' },
      yarn: { tool: '@yarnpkg/cli-dist@4.12.0', lockFile: 'yarn.lock', frozen: '--immutable' },
    }
    const selected = managers[manager]
    assert.ok(selected, `Unsupported PACKAGE_MANAGER: ${manager}`)
    const managerArgs = [npm, 'exec', '--yes', '--package=' + selected.tool, '--', manager]
    const managerEnv = { ...npmEnv, CI: 'false' }
    if (manager === 'yarn') await writeFile(join(tmp, '.yarnrc.yml'), 'nodeLinker: node-modules\nenableGlobalCache: false\nglobalFolder: ./.yarn/global\n')
    const installOptions = manager === 'pnpm' ? ['--store-dir', join(tmp, '.pnpm-store')] : []
    run([...managerArgs, 'install', ...installOptions], tmp, false, managerEnv)
    assert.ok((await readFile(join(tmp, selected.lockFile), 'utf8')).includes(tarballUrl))
    await rm(join(tmp, 'node_modules'), { recursive: true, force: true })
    run([...managerArgs, 'install', selected.frozen, ...installOptions], tmp, false, managerEnv)
  }

  await writeFile(join(tmp, 'esm.mts'), `
    import favicons, { ViteFaviconsPlugin as named } from 'vite-plugin-favicon'
    import type { ViteFaviconsPluginOptions } from 'vite-plugin-favicon'
    const options: ViteFaviconsPluginOptions = { source: './logo.svg' }
    void (favicons === named && favicons(options))
  `)
  await writeFile(join(tmp, 'commonjs.cts'), `
    import favicons = require('vite-plugin-favicon')
    const options: favicons.ViteFaviconsPluginOptions = { source: './logo.svg' }
    void [favicons(options), favicons.default(options), favicons.ViteFaviconsPlugin(options)]
  `)
  const tsc = join(root, 'node_modules/typescript/bin/tsc')
  run([tsc, '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext',
    join(tmp, 'esm.mts'), join(tmp, 'commonjs.cts')])

  const fixture = `
    import assert from 'node:assert/strict'
    import { createRequire } from 'node:module'
    import { writeFile } from 'node:fs/promises'
    import { build } from 'vite'
    import favicon, { ViteFaviconsPlugin } from 'vite-plugin-favicon'
    const require = createRequire(import.meta.url)
    const cjs = require('vite-plugin-favicon')
    assert.equal(favicon, ViteFaviconsPlugin)
    assert.equal(cjs, cjs.default)
    assert.equal(cjs, cjs.ViteFaviconsPlugin)
    await writeFile('index.html', '<!doctype html><html><head></head><body>Test</body></html>')
    await writeFile('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>')
    for (const [file, config] of [
      ['vite.config.mts', "import favicon from 'vite-plugin-favicon'; export default {plugins:[favicon('./logo.svg')]}"],
      ['vite.config.cjs', "const favicon = require('vite-plugin-favicon'); module.exports = {plugins:[favicon('./logo.svg')]}"],
    ]) {
      await writeFile(file, config)
      const { output } = await build({ configFile: file, logLevel: 'silent', build: { write: false } })
      const html = output.find(({ fileName }) => fileName === 'index.html').source.toString()
      assert.match(html, /href="\\/assets\\/favicons\\/favicon-32\\.[a-f0-9]+\\.png"/)
      assert.ok(output.some(({ fileName }) => /favicon-32\\..+\\.png$/.test(fileName)))
    }
  `
  await writeFile(join(tmp, 'smoke.mjs'), fixture)
  run(['smoke.mjs'])
  console.log(`Verified packed ${sourcePackage.name}@${sourcePackage.version} on Node ${process.version}, Vite ${vite} with ${manager}`)
} finally {
  await rm(tmp, { recursive: true, force: true })
}
