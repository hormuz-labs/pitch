// Stand-in for @solidjs/router on the static site. Pages are separate Astro
// routes, so links are plain anchors; links into the app go to the studio.
import { createContext, type JSX, splitProps, useContext } from 'solid-js'

export const STUDIO_URL = (import.meta.env.PUBLIC_STUDIO_URL ?? 'https://studio.trypitch.co').replace(/\/$/, '')

// Paths this site serves. Anything else belongs to the studio.
const SITE_PATHS = [/^\/$/, /^\/AgenC\/?$/, /^\/pricing\/?$/, /^\/affiliates\/?$/, /^\/about\/?$/, /^\/privacy\/?$/, /^\/terms\/?$/, /^\/product(\/|$)/, /^\/docs(\/|$)/, /^\/blog(\/|$)/, /^\/status\/?$/]

/** Where a path the old single app used really lives now. */
export function resolveHref(href: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const path = href.split(/[?#]/)[0] ?? href
  return SITE_PATHS.some((re) => re.test(path)) ? href : `${STUDIO_URL}${href}`
}

type Route = { params: Record<string, string>; path: string }
const RouteContext = createContext<Route>({ params: {}, path: '/' })

export function RouteProvider(props: { params?: Record<string, string>; path: string; children: JSX.Element }) {
  return (
    <RouteContext.Provider value={{ params: props.params ?? {}, path: props.path }}>
      {props.children}
    </RouteContext.Provider>
  )
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useContext(RouteContext).params as T
}

export function useLocation() {
  const route = useContext(RouteContext)
  return {
    get pathname() {
      return typeof window === 'undefined' ? route.path : window.location.pathname
    },
    get search() {
      return typeof window === 'undefined' ? '' : window.location.search
    },
    get hash() {
      return typeof window === 'undefined' ? '' : window.location.hash
    },
  }
}

export function useNavigate() {
  return (to: string, opts?: { replace?: boolean }) => {
    const href = resolveHref(to)
    if (opts?.replace) window.location.replace(href)
    else window.location.assign(href)
  }
}

export function Navigate(props: { href: string }) {
  if (typeof window !== 'undefined') window.location.replace(resolveHref(props.href))
  return null
}

type AProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; end?: boolean; activeClass?: string; inactiveClass?: string }

export function A(props: AProps) {
  const [local, rest] = splitProps(props, ['href', 'end', 'activeClass', 'inactiveClass', 'class'])
  const route = useContext(RouteContext)
  const active = () => (local.end ? route.path === local.href : route.path.startsWith(local.href) && local.href !== '/')
  const cls = () =>
    [local.class, active() ? local.activeClass : local.inactiveClass].filter(Boolean).join(' ') || undefined
  return <a {...rest} href={resolveHref(local.href)} class={cls()} />
}
