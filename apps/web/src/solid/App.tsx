import { Navigate, Route, Router, useLocation, useParams } from '@solidjs/router'
import { type Component, createEffect, type ParentProps, Show, Suspense } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { safeRedirect } from '../lib/redirect.ts'
import { AppShell, useAppShell } from './core/AppShell.tsx'
import { useAuth, useClerk } from './core/auth.tsx'
import { routeComponent } from './core/routes.tsx'

const Landing = routeComponent('landing')
const Pricing = routeComponent('pricing')
const About = routeComponent('about')
const Blog = routeComponent('blog')
const BlogPost = routeComponent('blogPost')
const Privacy = routeComponent('privacy')
const Terms = routeComponent('terms')
const Docs = routeComponent('docs')
const Affiliates = routeComponent('affiliates')
const Product = routeComponent('product')
const SharedDemo = routeComponent('sharedDemo')
const Auth = routeComponent('auth')
const NotFound = routeComponent('notFound')
const NewProject = routeComponent('newProject')
const Projects = routeComponent('projects')
const AccountPricing = routeComponent('pricingAccount')
const Settings = routeComponent('settings')
const ApiKeys = routeComponent('apiKeys')
const Sessions = routeComponent('sessions')
const ChatHistory = routeComponent('chats')
const Affiliate = routeComponent('affiliate')
const Admin = routeComponent('admin')
const CheckoutReturn = routeComponent('checkoutReturn')
const Studio = routeComponent('studio')

function ScrollToTop(props: ParentProps) {
  const location = useLocation()
  let previousPath = location.pathname
  createEffect(() => {
    const path = location.pathname
    if (path !== previousPath) window.scrollTo(0, 0)
    previousPath = path
  })
  return props.children
}

function Protected(props: { component: Component; shellProps?: boolean }) {
  const auth = useAuth()
  const location = useLocation()
  const returnTo = () => `${location.pathname}${location.search}${location.hash}`
  return (
    <Show when={auth.isLoaded()} fallback={<div class="h-screen w-screen bg-[var(--bg-page)]" />}>
      <Show
        when={auth.isSignedIn()}
        fallback={<Navigate href={`/sign-up?redirect=${encodeURIComponent(returnTo())}`} />}
      >
        <Show when={props.shellProps} fallback={<Dynamic component={props.component} />}>
          <ShellAwareRoute component={props.component} />
        </Show>
      </Show>
    </Show>
  )
}

function ShellAwareRoute(props: { component: Component }) {
  const shell = useAppShell()
  return (
    <Dynamic
      component={props.component as Component<{ openSettings?: typeof shell.openSettings }>}
      openSettings={shell.openSettings}
    />
  )
}

function SsoCallback() {
  const auth = useAuth()
  const clerk = useClerk()
  let handled = false
  createEffect(() => {
    if (!auth.isLoaded() || handled) return
    handled = true
    const linkingDiscord = sessionStorage.getItem('pitch_discord_link_pending') === '1'
    void clerk.handleRedirectCallback({
      signInFallbackRedirectUrl: linkingDiscord ? '/new?settings=connections' : '/new',
      signUpFallbackRedirectUrl: linkingDiscord ? '/new?settings=connections' : '/new',
    })
  })
  return <div class="h-screen w-screen bg-[var(--bg-page)]" />
}

function ProductRoute() {
  const params = useParams()
  return <Dynamic component={Product as Component<{ slug?: string }>} slug={params.slug} />
}

function SharedDemoRoute() {
  const params = useParams()
  return <Dynamic component={SharedDemo as Component<{ slug: string }>} slug={params.slug ?? ''} />
}

function DocsRoute() {
  const params = useParams()
  return <Dynamic component={Docs as Component<{ slug?: string }>} slug={params.slug} />
}

function AuthRoute() {
  const auth = useAuth()
  const location = useLocation()
  const destination = () => safeRedirect(new URLSearchParams(location.search).get('redirect'))
  const isSignIn = () => location.pathname === '/sign-in' || location.pathname === '/signin'
  return (
    <Show when={auth.isLoaded()} fallback={<div class="h-screen w-screen bg-[var(--bg-page)]" />}>
      <Show when={!auth.isSignedIn()} fallback={<Navigate href={destination()} />}>
        <Dynamic
          component={Auth as Component<{ mode: 'sign-in' | 'sign-up' }>}
          mode={isSignIn() ? 'sign-in' : 'sign-up'}
        />
      </Show>
    </Show>
  )
}

function PricingRoute() {
  const auth = useAuth()
  return (
    <Show when={auth.isLoaded()} fallback={<div class="h-screen w-screen bg-[var(--bg-page)]" />}>
      <Show when={auth.isSignedIn()} fallback={<Dynamic component={Pricing} />}>
        <Dynamic component={AccountPricing} />
      </Show>
    </Show>
  )
}

function StudioRoute() {
  const params = useParams()
  return (
    <Show keyed when={params.id}>
      {projectId => (
        <Dynamic component={Studio as Component<{ projectId: string }>} projectId={projectId} />
      )}
    </Show>
  )
}

const protectedRoute =
  (component: Component, shellProps = false) =>
  () => <Protected component={component} shellProps={shellProps} />
const redirect = (href: string) => () => <Navigate href={href} />

const shellPaths = [
  '/new',
  '/projects',
  '/p/',
  '/pricing',
  '/account/pricing',
  '/settings',
  '/api-keys',
  '/sessions',
  '/chats',
  '/affiliate',
  '/admin',
  '/checkout/return',
]

function AppRoot(props: ParentProps) {
  const auth = useAuth()
  const location = useLocation()
  const inShell = () =>
    auth.isSignedIn() &&
    shellPaths.some(path => location.pathname === path || location.pathname.startsWith(path))
  return (
    <ScrollToTop>
      <Suspense fallback={<div class="h-screen w-screen bg-[var(--bg-page)]" />}>
        <Show when={inShell()} fallback={props.children}>
          <AppShell>{props.children}</AppShell>
        </Show>
      </Suspense>
    </ScrollToTop>
  )
}

export default function App() {
  return (
    <Router root={AppRoot}>
      <Route path="/" component={Landing} />
      <Route path="/pricing" component={PricingRoute} />
      <Route path="/about" component={About} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/docs/*slug" component={DocsRoute} />
      <Route path="/affiliates" component={Affiliates} />
      <Route path="/product/:slug" component={ProductRoute} />
      <Route path="/d/:slug" component={SharedDemoRoute} />
      <Route path="/sign-in" component={AuthRoute} />
      <Route path="/sign-up" component={AuthRoute} />
      <Route path="/signin" component={AuthRoute} />
      <Route path="/signup" component={AuthRoute} />
      <Route path="/sso-callback" component={SsoCallback} />

      <Route path="/projects" component={protectedRoute(Projects)} />
      <Route path="/new" component={protectedRoute(NewProject, true)} />
      <Route path="/p/:id" component={protectedRoute(StudioRoute)} />
      <Route path="/account/pricing" component={protectedRoute(AccountPricing)} />
      <Route path="/settings" component={protectedRoute(Settings)} />
      <Route path="/api-keys" component={protectedRoute(ApiKeys)} />
      <Route path="/sessions" component={protectedRoute(Sessions)} />
      <Route path="/chats" component={protectedRoute(ChatHistory)} />
      <Route path="/affiliate" component={protectedRoute(Affiliate, true)} />
      <Route path="/admin" component={protectedRoute(Admin)} />
      <Route path="/checkout/return" component={protectedRoute(CheckoutReturn)} />

      <Route path="/dashboard" component={redirect('/new')} />
      <Route path="/pdf" component={redirect('/new?flow=deck')} />
      <Route path="/enhance" component={redirect('/new?flow=deck')} />
      <Route path="/edit" component={redirect('/new?flow=recording-edit')} />
      <Route path="/launch-video/*rest" component={redirect('/new?flow=launch-video')} />
      <Route path="*404" component={NotFound} />
    </Router>
  )
}
