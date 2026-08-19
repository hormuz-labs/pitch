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
const blogSrc = fs.readFileSync(path.join(root, 'src/components/Blog.tsx'), 'utf8')
const blogPosts = blogSrc
  .slice(blogSrc.indexOf('const BLOG_POSTS'))
  .split(/\{?\s*slug: '/)
  .slice(1)
  .map(block => {
    const slug = block.slice(0, block.indexOf("'"))
    const head = block.slice(0, block.indexOf('content:'))
    // Titles may be single- or double-quoted (double when they contain an apostrophe).
    const title =
      head.match(/title:\s*'((?:[^'\\]|\\.)*)'/)?.[1] ??
      head.match(/title:\s*"((?:[^"\\]|\\.)*)"/)?.[1]
    return { slug, title }
  })
  .filter(p => p.slug && p.title)

if (blogPosts.length === 0) {
  console.error('prerender: could not parse any blog posts from Blog.tsx')
  process.exit(1)
}

const routes = [
  // "Turn any URL" only appears once the LandingView <Seo> has run — the
  // index.html default title alone would pass a weaker marker.
  { path: '/', expect: 'Turn any URL' },
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
const browser = await chromium.launch()
const page = await browser.newPage()

const failures = []
for (const route of routes) {
  try {
    await page.goto(`${base}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Wait for the route's own <title> — set by the Seo component after mount.
    await page.waitForFunction(
      expected => document.title.includes(expected),
      route.expect,
      { timeout: 30_000 },
    )
    // And for real content in the root (some pages have no <h1>).
    await page.waitForFunction(
      () => (document.getElementById('root')?.innerText?.trim().length ?? 0) > 100,
      { timeout: 30_000 },
    )

    const html = `<!doctype html>\n${await page.evaluate(() => document.documentElement.outerHTML)}`
    if (!html.includes(route.expect)) {
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
