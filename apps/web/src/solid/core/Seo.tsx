import { createEffect, onCleanup } from 'solid-js'

export interface SeoProps {
  title: string
  description: string
  path: string
  image?: string
  /** Page-level schema.org JSON-LD; the site-wide graph lives in index.html. */
  jsonLd?: Record<string, unknown>
}

export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://trypitch.co').replace(/\/$/, '')

function upsertMeta(selector: string, attributes: Record<string, string>): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  const element = existing ?? document.createElement('meta')
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  if (!existing) document.head.append(element)
  return element
}

export function Seo(props: SeoProps) {
  createEffect(() => {
    const previousTitle = document.title
    document.title = props.title
    const url = `${SITE_URL}${props.path.startsWith('/') ? props.path : `/${props.path}`}`
    const canonical =
      document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      document.createElement('link')
    canonical.rel = 'canonical'
    canonical.href = url
    if (!canonical.isConnected) document.head.append(canonical)

    upsertMeta('meta[name="description"]', { name: 'description', content: props.description })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: props.title })
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: props.description,
    })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url })
    upsertMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: props.image ? 'summary_large_image' : 'summary',
    })
    if (props.image) {
      upsertMeta('meta[property="og:image"]', { property: 'og:image', content: props.image })
      upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: props.image })
    }

    // A prerendered page already carries its JSON-LD; replace it, never stack a copy.
    for (const stale of document.head.querySelectorAll('script[data-page]')) stale.remove()
    let ld: HTMLScriptElement | undefined
    if (props.jsonLd) {
      ld = document.createElement('script')
      ld.type = 'application/ld+json'
      ld.dataset.page = ''
      ld.textContent = JSON.stringify(props.jsonLd)
      document.head.append(ld)
    }

    onCleanup(() => {
      document.title = previousTitle
      ld?.remove()
    })
  })
  return null
}
