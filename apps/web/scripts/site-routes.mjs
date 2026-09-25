// The public site's route list and content index, read straight out of the
// TypeScript sources (plain node cannot import them). Shared by the prerender
// (which needs a browser) and the Vite plugin that writes sitemap.xml and
// llms.txt (which does not, so it runs even when only `vite build` does).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SITE = 'https://trypitch.co'

// Slugs and titles are parsed straight out of the TypeScript sources (this
// script runs on plain node, so it cannot import them) so the prerender set
// always matches what the app renders. Each source keeps `slug:` on the line
// directly above its title field.
export const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const pairs = (src, titleKey) =>
  [
    ...src.matchAll(
      new RegExp(
        `^\\s*slug: '([^']*)',\\n\\s*${titleKey}: (?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"),$`,
        'gm',
      ),
    ),
  ].map(m => ({ slug: m[1], title: (m[2] ?? m[3]).replace(/\\(.)/g, '$1') }))

const blogSrc = read('src/solid/public/blogPosts.ts')
const productSrc = read('src/solid/public/productCatalog.tsx')
// Everything after a post's slug up to the next one: date, category, excerpt.
const fieldIn = (src, slug, key) => {
  const start = src.indexOf(`slug: '${slug}'`)
  const next = src.indexOf("slug: '", start + 1)
  const block = src.slice(start, next === -1 ? undefined : next)
  const m = block.match(new RegExp(`${key}:\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`))
  return m ? (m[1] ?? m[2]).replace(/\\(.)/g, '$1') : ''
}
export const blogPosts = pairs(blogSrc, 'title').map(p => ({
  ...p,
  date: fieldIn(blogSrc, p.slug, 'date'),
  category: fieldIn(blogSrc, p.slug, 'category'),
  excerpt: fieldIn(blogSrc, p.slug, 'excerpt'),
}))
export const docPages = pairs(read('src/docs/pages.tsx'), 'title')
export const products = pairs(productSrc, 'name').map(p => ({ ...p, nav: fieldIn(productSrc, p.slug, 'nav') }))

for (const [name, list] of [
  ['blog posts', blogPosts],
  ['doc pages', docPages],
  ['products', products],
]) {
  if (list.length === 0) {
    throw new Error(`site-routes: could not parse any ${name} from their source`)
  }
}

export const routes = [
  // The landing page is verified structurally, not by copy. It previously waited
  // on a headline string that later changed, so `/` silently stopped
  // prerendering and shipped as an empty SPA shell while every other route was
  // fine. A selector survives copy edits; marketing copy does not.
  { path: '/', selector: '.lb-root .lb-agenc-title' },
  { path: '/AgenC', selector: '.lb-root .lb-agenc-page-title' },
  // Wait for the model prices (fetched from the API) so they ship in the HTML.
  { path: '/pricing', expect: 'Pricing', selector: '.public-pricing-tiers[data-ready]' },
  { path: '/affiliates', expect: 'Affiliate program' },
  ...products.map(p => ({ path: `/product/${p.slug}`, expect: p.title })),
  ...docPages.map(p =>
    p.slug ? { path: `/docs/${p.slug}`, expect: p.title } : { path: '/docs', expect: 'Pitch API' },
  ),
  { path: '/about', expect: 'About Us' },
  { path: '/blog', expect: 'Blog' },
  ...blogPosts.map(p => ({ path: `/blog/${p.slug}`, expect: p.title.slice(0, 40) })),
  { path: '/privacy', expect: 'Privacy Policy' },
  { path: '/terms', expect: 'Terms of Service' },
]

