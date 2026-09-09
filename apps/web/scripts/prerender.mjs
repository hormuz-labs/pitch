// Build-time prerendering of the public marketing pages.
//
// Serves the production build in dist/ locally, visits every public route with
// headless Chromium (Playwright, hoisted at the repo root), and writes the
// fully-rendered HTML back into dist/<route>/index.html. Vercel serves static
// files before the SPA catch-all rewrite, so crawlers and AI agents that do
// not execute JavaScript get complete pages; client-side routing is unchanged.
//
// Run after `vite build`:  node scripts/prerender.mjs   (from apps/web)
import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

// ── Route list ────────────────────────────────────────────────────────────────
// Blog slugs/titles are parsed out of the BLOG_POSTS source so the prerender
// set always matches what the app renders.
const blogSrc = fs.readFileSync(path.join(root, 'src/solid/public/Blog.tsx'), 'utf8')
const blogPosts = blogSrc
  .slice(blogSrc.indexOf('export const BLOG_POSTS'), blogSrc.indexOf('].map'))
  .split(/\n  \[\n/)
  .slice(1)
  .map(block => {
    const fields = [...block.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),?$/gm)].map(
      match => match[1] ?? match[2],
    )
    return { slug: fields[0], title: fields[4] }
  })
  .filter(p => p.slug && p.title)

if (blogPosts.length === 0) {
  console.error('prerender: could not parse any blog posts from solid/public/Blog.tsx')
  process.exit(1)
}

const routes = [
  // The landing page is verified structurally, not by copy. It previously waited
  // on a headline string that later changed, so `/` silently stopped
  // prerendering and shipped as an empty SPA shell while every other route was
  // fine. A selector survives copy edits; marketing copy does not.
  { path: '/', selector: '.lb-root .lb-endcap-title' },
  { path: '/pricing', expect: 'Pricing' },
  { path: '/about', expect: 'About Us' },
  { path: '/blog', expect: 'Blog' },
  ...blogPosts.map(p => ({ path: `/blog/${p.slug}`, expect: p.title.slice(0, 40) })),
  { path: '/privacy', expect: 'Privacy Policy' },
  { path: '/terms', expect: 'Terms of Service' },
]

// ── Tiny static server with SPA fallback ─────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.md': 'text/markdown',
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(dist, urlPath)
  if (!file.startsWith(dist)) {
    res.writeHead(403).end()
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(dist, 'index.html') // SPA fallback
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

// ── Render each route ────────────────────────────────────────────────────────
// The API's share routes (/d/:slug) fetch the deployed app shell and inject
// per-job OG tags into it. That shell used to be `/`, which was an empty SPA
// stub — but `/` is now a fully prerendered landing page, so a share link would
// paint the whole homepage before the app replaced it with the demo. Keep a copy
// of the content-free build output for that purpose before `/` is overwritten.
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, 'app-shell.html'))
console.log('wrote dist/app-shell.html (content-free shell for share routes)')

const browser = await chromium.launch()
const page = await browser.newPage()
// The landing intro overlay in index.html removes itself ~1.9s after paint.
// Flag the prerender run so it leaves the markup alone and the captured HTML
// still carries the intro for real visitors.
await page.addInitScript(() => {
  window.__PITCH_PRERENDER__ = true
})

const failures = []
for (const route of routes) {
  try {
    await page.goto(`${base}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Wait for the route to actually render: a structural selector where the
    // route declares one, otherwise the route's own <title> (set by <Seo> on mount).
    if (route.selector) {
      await page.waitForSelector(route.selector, { timeout: 30_000 })
    } else {
      await page.waitForFunction(
        expected => document.title.includes(expected),
        route.expect,
        { timeout: 30_000 },
      )
    }
    // And for real content in the root (some pages have no <h1>).
    await page.waitForFunction(
      () => (document.getElementById('root')?.innerText?.trim().length ?? 0) > 100,
      { timeout: 30_000 },
    )

    // Vite injects preload <link>s and lazy-chunk stylesheets with the absolute
    // origin the page was loaded from. Left as-is, every prerendered page would
    // ship links to this throwaway localhost server and fetch none of them in
    // production — the landing page in particular would paint unstyled until the
    // client re-injected its CSS. Rewrite the base back to root-relative.
    const raw = await page.evaluate(() => document.documentElement.outerHTML)
    const html = `<!doctype html>\n${raw.split(base).join('')}`
    if (html.includes('127.0.0.1:')) {
      throw new Error('rendered HTML still references the prerender server origin')
    }
    if (route.expect && !html.includes(route.expect)) {
      throw new Error(`expected marker ${JSON.stringify(route.expect)} not in rendered HTML`)
    }

    const outFile =
      route.path === '/' ? path.join(dist, 'index.html') : path.join(dist, route.path, 'index.html')
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, html)
    console.log(`prerendered ${route.path} -> ${path.relative(root, outFile)}`)
  } catch (err) {
    failures.push(`${route.path}: ${err.message}`)
  }
}

await browser.close()
server.close()

if (failures.length > 0) {
  console.error(`\nprerender failed for ${failures.length} route(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`\nprerender: ${routes.length} routes written`)
