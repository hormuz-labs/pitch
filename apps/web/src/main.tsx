import { ClerkProvider } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PostHogProvider } from './analytics/PostHogProvider.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

const container = document.getElementById('root')!

const tree = (
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <PostHogProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </PostHogProvider>
    </ClerkProvider>
  </StrictMode>
)

// The public routes are prerendered to static HTML at build time (see
// scripts/prerender.mjs), so their content is already on screen before this
// script runs. React clears the container on its first commit, and if the
// route's lazy chunk has not arrived by then that commit paints the Suspense
// fallback — a full-screen blank panel — replacing real content with nothing
// for as long as the chunk takes. Warming the chunk first means the first
// commit renders the view itself, so the prerendered markup is swapped for the
// live one directly.
//
// Hydration would avoid the swap entirely but is not an option here: the
// prerenderer captures the DOM after the page's own scripts have mutated it
// (ScrollTrigger's pinning injects pin-spacer wrappers, reveal observers add
// classes), so React's initial render can never match the saved markup.
const ROUTE_CHUNKS: [test: RegExp, load: () => Promise<unknown>][] = [
  [/^\/$/, () => import('./views/LandingView.tsx')],
  [/^\/pricing\/?$/, () => import('./views/PublicPricingView.tsx')],
  [/^\/about\/?$/, () => import('./components/AboutUs.tsx')],
  [/^\/blog(\/|$)/, () => import('./components/Blog.tsx')],
  [/^\/privacy\/?$/, () => import('./components/PrivacyPolicy.tsx')],
  [/^\/terms\/?$/, () => import('./components/TermsOfService.tsx')],
]

const mount = () => createRoot(container).render(tree)

const prerenderedRoute = container.firstElementChild
  ? ROUTE_CHUNKS.find(([test]) => test.test(window.location.pathname))
  : undefined

if (prerenderedRoute) {
  // Never let a failed or slow chunk hold the app hostage — the fallback flash
  // is worse than nothing, a boot that never happens is worse than both.
  prerenderedRoute[1]().then(mount, mount)
} else {
  mount()
}
