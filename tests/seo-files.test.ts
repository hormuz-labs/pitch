/**
 * Production runs only `vite build` (no browser), so the sitemap, llms.txt and
 * blog share cards must not depend on the prerender. These pin that: the files
 * come from the page sources, and every post has a committed share card.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM build script
import { llmsTxt, sitemapXml } from '../apps/web/scripts/seo-files.mjs'
import { BLOG_POSTS } from '../apps/web/src/solid/public/blogPosts.js'

const web = path.join(import.meta.dirname, '..', 'apps', 'web')
// productCatalog.tsx holds JSX the unit runner does not parse; its slugs are plain text.
const PRODUCTS = [
  ...fs
    .readFileSync(path.join(web, 'src', 'solid', 'public', 'productCatalog.tsx'), 'utf8')
    .matchAll(/^\s{4}slug: '([^']+)',$/gm),
].map(m => ({ slug: m[1] }))

describe('SEO files', () => {
  it('lists every blog post and product page in the sitemap', () => {
    const xml: string = sitemapXml()
    for (const post of BLOG_POSTS) expect(xml).toContain(`https://trypitch.co/blog/${post.slug}<`)
    for (const product of PRODUCTS)
      expect(xml).toContain(`https://trypitch.co/product/${product.slug}<`)
  })

  it('links every guide and product from llms.txt', () => {
    const txt: string = llmsTxt()
    for (const post of BLOG_POSTS) expect(txt).toContain(`/blog/${post.slug})`)
    for (const product of PRODUCTS) expect(txt).toContain(`/product/${product.slug})`)
  })

  it('has a committed share card for every blog post', () => {
    for (const post of BLOG_POSTS)
      expect(
        fs.existsSync(path.join(web, 'public', 'og', 'blog', `${post.slug}.png`)),
        post.slug,
      ).toBe(true)
  })
})
