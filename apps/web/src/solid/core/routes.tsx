import type { Component } from 'solid-js'
import { lazy } from 'solid-js'
import { isStaleBuildError, reloadForNewBuild, whileReloading } from '../../lib/stale-build'
import { discoveredRouteModules } from './route-modules'

export type SolidRouteModule = { default: Component }

interface RouteModuleContract {
  path: string
  exportName: string
}

/**
 * Route module contract: each file below default-exports a Solid component.
 * Route components read path/search state with @solidjs/router hooks, so no
 * adapter-specific props are required.
 */
const route = (path: string, exportName: string): RouteModuleContract => ({ path, exportName })

export const ROUTE_MODULES = {
  landing: route('../public/LandingView.tsx', 'LandingView'),
  agenc: route('../public/AgenCView.tsx', 'AgenCView'),
  pricing: route('../public/PublicPricingView.tsx', 'PublicPricingView'),
  about: route('../public/LegalViews.tsx', 'AboutUs'),
  blog: route('../public/Blog.tsx', 'Blog'),
  blogPost: route('../public/Blog.tsx', 'BlogPostView'),
  privacy: route('../public/LegalViews.tsx', 'PrivacyPolicy'),
  terms: route('../public/LegalViews.tsx', 'TermsOfService'),
  docs: route('../public/DocsView.tsx', 'DocsView'),
  affiliates: route('../public/AffiliatesView.tsx', 'AffiliatesView'),
  product: route('../public/ProductView.tsx', 'ProductView'),
  sharedDemo: route('../public/PublicDemoView.tsx', 'PublicDemoView'),
  auth: route('../public/AuthView.tsx', 'AuthView'),
  notFound: route('../public/StatusView.tsx', 'NotFoundView'),
  newProject: route('../account/NewProjectView.tsx', 'NewProjectView'),
  projects: route('../account/ProjectsView.tsx', 'ProjectsView'),
  pricingAccount: route('../account/PricingView.tsx', 'PricingView'),
  settings: route('../account/SettingsView.tsx', 'SettingsView'),
  apiKeys: route('../account/ApiKeysView.tsx', 'ApiKeysView'),
  sessions: route('../account/SessionsView.tsx', 'SessionsView'),
  chats: route('../account/ChatHistoryView.tsx', 'ChatHistoryView'),
  admin: route('../account/AdminView.tsx', 'AdminView'),
  checkoutReturn: route('../account/CheckoutReturnView.tsx', 'CheckoutReturnView'),
  studio: route('../studio/StudioView.tsx', 'StudioView'),
} as const satisfies Record<string, RouteModuleContract>

export type RouteModuleId = keyof typeof ROUTE_MODULES

function missingRoute(id: RouteModuleId): SolidRouteModule {
  const { path } = ROUTE_MODULES[id]
  return {
    default: () => (
      <main data-missing-solid-route={id} style={{ padding: '2rem', 'font-family': 'sans-serif' }}>
        <h1>Route is being migrated</h1>
        <p>
          Add a default-exported Solid component at <code>src/solid/{path.slice(3)}</code>.
        </p>
      </main>
    ),
  }
}

/** A chunk that would not load even after reloading for the new build. */
function unavailableRoute(id: RouteModuleId): SolidRouteModule {
  return {
    default: () => (
      <main
        data-unavailable-solid-route={id}
        role="alert"
        style={{ padding: '2rem', 'font-family': 'sans-serif', 'text-align': 'center' }}
      >
        <h1 style={{ 'font-size': '18px' }}>This page didn’t load</h1>
        <p>Pitch may have just been updated. Refresh to load the latest version.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </main>
    ),
  }
}

export async function loadRouteModule(id: RouteModuleId): Promise<SolidRouteModule> {
  const contract = ROUTE_MODULES[id]
  const loader = discoveredRouteModules[contract.path]
  if (!loader) return missingRoute(id)
  try {
    const module = (await loader()) as Record<string, unknown> | undefined
    // Undefined means the vite:preloadError handler cancelled a stale-chunk
    // failure because the page is already reloading onto the new build.
    if (!module) return whileReloading()
    const component = module.default ?? module[contract.exportName]
    return typeof component === 'function' ? { default: component as Component } : missingRoute(id)
  } catch (error) {
    if (isStaleBuildError(error)) {
      if (reloadForNewBuild()) return whileReloading()
      console.error(`Failed to load Solid route ${id} after reloading`, error)
      return unavailableRoute(id)
    }
    console.error(`Failed to load Solid route ${id}`, error)
    return missingRoute(id)
  }
}

export const routeComponent = (id: RouteModuleId) => lazy(() => loadRouteModule(id))

const PUBLIC_PRELOADS: ReadonlyArray<[RegExp, RouteModuleId]> = [
  [/^\/$/, 'landing'],
  [/^\/AgenC\/?$/, 'agenc'],
  [/^\/pricing\/?$/, 'pricing'],
  [/^\/about\/?$/, 'about'],
  [/^\/blog\/?$/, 'blog'],
  [/^\/blog\//, 'blogPost'],
  [/^\/privacy\/?$/, 'privacy'],
  [/^\/terms\/?$/, 'terms'],
]

export function preloadPrerenderedRoute(pathname: string): Promise<unknown> | undefined {
  const match = PUBLIC_PRELOADS.find(([pattern]) => pattern.test(pathname))
  return match ? loadRouteModule(match[1]) : undefined
}
