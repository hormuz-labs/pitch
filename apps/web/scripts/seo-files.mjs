// sitemap.xml and llms.txt, written into the build output. Needs no browser, so
// it runs inside `vite build` (see vite.config.ts) and ships even where the
// prerender does not run. Both come from site-routes.mjs, the same list the
// prerender renders, so they cannot drift from the pages that exist.
import fs from 'node:fs'
import path from 'node:path'
import { blogPosts, products, root, routes, SITE } from './site-routes.mjs'

const priority = p =>
  p === '/'
    ? '1.0'
    : /^\/(pricing|product\/|AgenC)/.test(p)
      ? '0.9'
      : /^\/(privacy|terms)$/.test(p)
        ? '0.3'
        : '0.7'

export function sitemapXml() {
  const lastmod = p => blogPosts.find(b => `/blog/${b.slug}` === p)?.date
  const urls = routes.map(r => {
    const date = lastmod(r.path)
    return `  <url>\n    <loc>${SITE}${r.path}</loc>${date ? `\n    <lastmod>${date}</lastmod>` : ''}\n    <priority>${priority(r.path)}</priority>\n  </url>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

export function llmsTxt() {
  const apiDoc = fs.readFileSync(path.join(root, 'public', 'llms.txt'), 'utf8')
  return `# Pitch

> Pitch (trypitch.co) is an AI production studio you direct by chat. One agent researches a product, records it in a real browser, writes and narrates, and edits launch films, product demos, slide decks and video edits in one conversation.

## Products

${products.map(p => `- [${p.title}](${SITE}/product/${p.slug}): ${p.nav}`).join('\n')}

## Guides

${blogPosts.map(p => `- [${p.title}](${SITE}/blog/${p.slug}): ${p.excerpt}`).join('\n')}

## Pricing

- [Pricing](${SITE}/pricing): credit-based Pro and Max plans, Flex add-on credits. Machine-readable: ${SITE}/pricing.md

${apiDoc.replace(/^# Pitch API\s*/, '## API\n\n')}`
}

export function writeSeoFiles(dist) {
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemapXml())
  fs.writeFileSync(path.join(dist, 'llms.txt'), llmsTxt())
}
