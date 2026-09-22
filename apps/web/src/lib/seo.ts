export const SITE_URL = 'https://trypitch.co'
export const SITE_NAME = 'Pitch'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

export const DEFAULT_TITLE = 'Pitch — Directable AI production studio'
export const DEFAULT_DESCRIPTION =
  'Pitch is a directable AI production studio that turns a URL, recording, document, asset, or rough idea into polished launch films, product demos, demo recordings, slide decks, and edited videos.'

export interface BlogSeoInput {
  slug: string
  title: string
  excerpt: string
  date: string // e.g. "May 28, 2026"
}

/** BlogPosting JSON-LD for a single blog article. */
export function blogPostingJsonLd(post: BlogSeoInput) {
  const url = `${SITE_URL}/blog/${post.slug}`
  const isoDate = new Date(post.date).toISOString()
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: isoDate,
    dateModified: isoDate,
    author: { '@id': `${SITE_URL}/#org` },
    publisher: { '@id': `${SITE_URL}/#org` },
    isPartOf: { '@id': `${SITE_URL}/#site` },
  }
}

/** BreadcrumbList JSON-LD: Home > Blog > Post. */
export function blogBreadcrumbJsonLd(post: BlogSeoInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/blog/${post.slug}` },
    ],
  }
}
