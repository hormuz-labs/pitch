// Page titles, descriptions, canonical links and JSON-LD are written into the
// static HTML by each Astro page (see src/pages and src/lib/seo.ts), so the
// component the pages render is a no-op.
export interface SeoProps {
  title: string
  description: string
  path: string
  image?: string
  jsonLd?: Record<string, unknown>
}

export const SITE_URL = (import.meta.env.PUBLIC_SITE_URL ?? 'https://trypitch.co').replace(/\/$/, '')

export function Seo(_props: SeoProps) {
  return null
}
