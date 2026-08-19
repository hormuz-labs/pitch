import { useEffect } from 'react'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  SITE_NAME,
  SITE_URL,
} from '../lib/seo'

interface SeoProps {
  title: string
  description: string
  /** Canonical path, e.g. "/blog/my-post". */
  path: string
  type?: 'website' | 'article'
  image?: string
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

const JSONLD_ATTR = 'data-seo-jsonld'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Per-route document head management (title, description, canonical, OG/Twitter,
 * optional JSON-LD). Restores the index.html defaults on unmount so navigating
 * back to a page without <Seo /> leaves sane tags.
 */
export function Seo({ title, description, path, type = 'website', image, jsonLd }: SeoProps) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`
    const ogImage = image ?? DEFAULT_OG_IMAGE

    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:image', ogImage)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', ogImage)
    upsertCanonical(url)

    const items = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []
    const scripts: HTMLScriptElement[] = []
    for (const item of items) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.setAttribute(JSONLD_ATTR, '')
      script.textContent = JSON.stringify(item)
      document.head.appendChild(script)
      scripts.push(script)
    }

    return () => {
      document.title = DEFAULT_TITLE
      upsertMeta('name', 'description', DEFAULT_DESCRIPTION)
      upsertCanonical(`${SITE_URL}/`)
      for (const script of scripts) script.remove()
    }
  }, [title, description, path, type, image, jsonLd])

  return null
}
