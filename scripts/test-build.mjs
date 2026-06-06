/**
 * test-build.mjs — Local end-to-end test of the production build
 *
 * 1. Runs `vite build`
 * 2. Starts `vite preview` (or a fallback static server) on a free port
 * 3. Invokes scripts/test-deploy.mjs against the local URL
 * 4. Tears the server down and exits with the test's exit code
 *
 * This simulates exactly what GitHub Pages would serve, so you can
 * validate the build before pushing.
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import net from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', cwd: root, ...opts })
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)))
  })
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

async function waitForUrl(url, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.status < 500) return
    } catch {}
    await sleep(250)
  }
  throw new Error(`timeout waiting for ${url}`)
}

const port = await getFreePort()
const url = `http://localhost:${port}/spatial-context-modeller/`

console.log('\n\x1b[1m→ Running vite build\x1b[0m')
await run('npx', ['vite', 'build'])

console.log(`\n\x1b[1m→ Starting vite preview on port ${port}\x1b[0m`)
const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let previewReady = false
preview.stdout.on('data', d => { process.stdout.write('  [preview] ' + d) })
preview.stderr.on('data', d => { process.stderr.write('  [preview] ' + d) })
preview.on('exit', code => {
  if (!previewReady) {
    console.error(`\n\x1b[31mvite preview exited prematurely with code ${code}\x1b[0m`)
    process.exit(1)
  }
})

const cleanup = () => { try { preview.kill('SIGTERM') } catch {} }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

try {
  await waitForUrl(url)
  previewReady = true
  console.log(`\n\x1b[1m→ Running test-deploy.mjs against ${url}\x1b[0m`)
  await run('node', [join(__dirname, 'test-deploy.mjs'), url])
  console.log('\n\x1b[32m✓ local build test passed\x1b[0m')
} catch (e) {
  console.error(`\n\x1b[31m✗ local build test failed: ${e.message}\x1b[0m`)
  cleanup()
  process.exit(1)
} finally {
  cleanup()
  await sleep(300)
}
