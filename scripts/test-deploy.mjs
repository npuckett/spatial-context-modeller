/**
 * test-deploy.mjs — Deployment smoke test
 *
 * Usage:
 *   node scripts/test-deploy.mjs <url>
 *   DEPLOY_URL=<url> node scripts/test-deploy.mjs
 *
 * Checks:
 *   1. Page returns 200
 *   2. Served HTML is the BUILT page (not the dev index.html from repo root)
 *   3. All assets referenced in the HTML return 200
 *   4. If a headless Chrome is available, load the page in it and report:
 *      - Uncaught page errors
 *      - console.error messages
 *      - Failed network requests
 *      - Whether critical DOM elements rendered (#root content, <canvas>, .top-bar)
 *
 * Exits with code 1 if any issues are found, 0 otherwise.
 */

import { stat } from 'node:fs/promises'

const url = process.argv[2] || process.env.DEPLOY_URL
if (!url) {
  console.error('Usage: node scripts/test-deploy.mjs <url>')
  console.error('   or: DEPLOY_URL=<url> node scripts/test-deploy.mjs')
  process.exit(2)
}

const issues = []
const warnings = []
const passed = []

function fail(msg) { issues.push(msg); console.log('  \x1b[31m✗\x1b[0m ' + msg) }
function warn(msg) { warnings.push(msg); console.log('  \x1b[33m⚠\x1b[0m ' + msg) }
function pass(msg) { passed.push(msg); console.log('  \x1b[32m✓\x1b[0m ' + msg) }
function info(msg) { console.log('  \x1b[90m·\x1b[0m ' + msg) }

console.log(`\n\x1b[1mTesting deployment at:\x1b[0m ${url}\n`)

// ---------- 1. Page status ----------
console.log('\x1b[1m1. Page status\x1b[0m')
let html, finalUrl
try {
  const res = await fetch(url, { redirect: 'follow' })
  finalUrl = res.url
  if (res.status === 200) pass(`HTTP 200 (${res.url})`)
  else fail(`HTTP ${res.status} for ${url}`)
  html = await res.text()
  if (html.length === 0) fail('Response body is empty')
  else info(`body size: ${(html.length / 1024).toFixed(1)} KB`)
} catch (e) {
  fail(`Fetch failed: ${e.message}`)
  printSummary()
  process.exit(1)
}

// ---------- 2. HTML sanity ----------
console.log('\n\x1b[1m2. HTML sanity\x1b[0m')
if (html.includes('/src/main.jsx')) {
  fail('Served HTML references /src/main.jsx — this is the DEV page (index.html from repo root).')
  fail('  Likely cause: GitHub Pages is deploying the repo root, not the built dist/ folder.')
  fail('  Likely fix:   remove any auto-generated static.yml workflow; keep only the workflow with `path: dist`.')
} else if (/<script[^>]+src="\/[^"]*assets\/index-[^"]+\.js"/.test(html)) {
  pass('HTML references built asset bundle (/assets/index-*.js)')
} else {
  warn('HTML does not match expected dev or built patterns — manual review recommended')
  info('first 400 chars: ' + html.slice(0, 400).replace(/\n/g, ' '))
}

if (/<div id="root"><\/div>/.test(html)) pass('mount point #root present')
else fail('mount point #root not found')

// ---------- 3. Asset checks ----------
console.log('\n\x1b[1m3. Asset checks\x1b[0m')
const assetRegex = /(?:src|href)="(\/[^"]+)"/g
const assets = [...new Set([...html.matchAll(assetRegex)].map(m => m[1]))]
if (assets.length === 0) {
  warn('No relative asset URLs found in HTML')
} else {
  info(`found ${assets.length} asset reference(s)`)
  for (const asset of assets) {
    const assetUrl = new URL(asset, finalUrl).href
    try {
      const res = await fetch(assetUrl, { method: 'HEAD', redirect: 'follow' })
      if (res.status === 200) pass(`${asset} → 200`)
      else fail(`${asset} → HTTP ${res.status}`)
    } catch (e) {
      try {
        const res2 = await fetch(assetUrl, { method: 'GET', redirect: 'follow' })
        if (res2.status === 200) pass(`${asset} → 200`)
        else fail(`${asset} → HTTP ${res2.status}`)
      } catch (e2) {
        fail(`${asset} → fetch failed: ${e2.message}`)
      }
    }
  }
}

// ---------- 4. Headless browser ----------
console.log('\n\x1b[1m4. Runtime errors (headless Chrome)\x1b[0m')
const chromePath = await findChrome()
if (!chromePath) {
  warn('Chrome not found — skipping runtime checks')
  info('Install Google Chrome (already present on this Mac) or set CHROME_PATH')
} else {
  info(`Chrome: ${chromePath}`)
  let puppeteer
  try {
    puppeteer = await import('puppeteer-core')
  } catch (e) {
    warn(`puppeteer-core not available: ${e.message}`)
  }
  if (puppeteer) {
    const pageErrors = []
    const consoleErrors = []
    const failedRequests = []
    let browser
    try {
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--use-gl=swiftshader',
          '--enable-unsafe-swiftshader',
          '--enable-webgl',
          '--ignore-gpu-blocklist',
        ],
      })
      const page = await browser.newPage()
      page.on('pageerror', e => pageErrors.push(e.message))
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })
      page.on('requestfailed', req => {
        const reason = req.failure()?.errorText || 'unknown'
        failedRequests.push(`${req.url()} — ${reason}`)
      })
      page.on('response', res => {
        if (res.status() >= 400) failedRequests.push(`${res.url()} — HTTP ${res.status()}`)
      })
      try {
        await page.goto(finalUrl, { waitUntil: 'networkidle2', timeout: 30000 })
        await sleep(2500) // let Three.js / React finish mounting
        const checks = await page.evaluate(() => {
          const root = document.getElementById('root')
          return {
            rootExists: !!root,
            rootHasContent: !!(root && root.children.length > 0),
            canvasExists: !!document.querySelector('canvas'),
            topBarExists: !!document.querySelector('.top-bar'),
            bodyText: (document.body.innerText || '').slice(0, 200),
          }
        })
        if (checks.rootExists) { pass('#root exists') } else { fail('#root not found') }
        if (checks.rootHasContent) { pass('#root has rendered content') }
        else { fail('#root is empty — React app likely failed to mount') }
        if (checks.canvasExists) { pass('<canvas> rendered (3D viewport mounted)') }
        else { warn('no <canvas> — Three.js viewport may not have mounted') }
        if (checks.topBarExists) { pass('.top-bar rendered (UI shell mounted)') }
        else { warn('no .top-bar — UI shell may not have rendered') }
        for (const e of pageErrors) {
          if (isEnvironmentalError(e)) warn(`page error (headless env, may be OK in real browser): ${e}`)
          else fail(`page error: ${e}`)
        }
        for (const e of consoleErrors) {
          if (isEnvironmentalError(e)) warn(`console.error (headless env): ${e}`)
          else fail(`console.error: ${e}`)
        }
        for (const r of failedRequests) {
          const reqUrl = r.split(' — ')[0]
          if (/\/favicon\.ico(\?|$|#)/.test(reqUrl)) warn(`failed request (non-critical): ${r}`)
          else fail(`failed request: ${r}`)
        }
        if (pageErrors.length === 0 && consoleErrors.length === 0 && failedRequests.length === 0) {
          pass('no runtime JS errors or failed requests')
        }
      } catch (e) {
        fail(`browser navigation failed: ${e.message}`)
      } finally {
        if (browser) await browser.close()
      }
    } catch (e) {
      fail(`headless Chrome launch failed: ${e.message}`)
      if (browser) try { await browser.close() } catch {}
    }
  }
}

printSummary()
process.exit(issues.length > 0 ? 1 : 0)

function printSummary() {
  console.log('\n' + '='.repeat(60))
  console.log(`\x1b[1mSummary:\x1b[0m ${passed.length} passed, ${warnings.length} warning(s), ${issues.length} issue(s)`)
  if (issues.length > 0) {
    console.log('\n\x1b[31mIssues:\x1b[0m')
    for (const i of issues) console.log('  ✗ ' + i)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function findChrome() {
  if (process.env.CHROME_PATH) {
    if (await exists(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  }
  const candidates = process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ] : [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ]
  for (const p of candidates) {
    if (await exists(p)) return p
  }
  return null
}

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

function isEnvironmentalError(msg) {
  // Errors that commonly occur in headless Chrome but work fine in real browsers.
  return /WebGL/i.test(msg)
        || /GPU process/i.test(msg)
        || /SwiftShader/i.test(msg)
}
