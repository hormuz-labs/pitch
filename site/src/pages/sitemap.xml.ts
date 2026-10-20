// Every page this site renders, for search engines.
import type { APIRoute } from 'astro'
import { DOC_PAGES } from '../docs/pages'
import { BLOG_POSTS } from '../solid/public/blogPosts'
import { PRODUCTS } from '../solid/public/productCatalog'

const SITE = 'https://trypitch.co'

export const GET: APIRoute = () => {
  const paths = [
    '/',
    '/AgenC',
    '/pricing',
    '/affiliates',
    '/about',
    '/privacy',
    '/terms',
    '/blog',
    ...BLOG_POSTS.map((p) => `/blog/${p.slug}`),
    ...PRODUCTS.map((p) => `/product/${p.slug}`),
    ...DOC_PAGES.map((p) => (p.slug ? `/docs/${p.slug}` : '/docs')),
  ]
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>
`
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } })
}
