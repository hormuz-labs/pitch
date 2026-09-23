import { render } from 'solid-js/web'
import './index.css'
import App from './solid/App.tsx'
import { ClerkProvider, PostHogProvider, ThemeProvider } from './solid/core/index.ts'
import { preloadPrerenderedRoute } from './solid/core/routes.tsx'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!publishableKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root mount element')

const mount = () => {
  if (container.firstElementChild) container.replaceChildren()
  render(
    () => (
      <ClerkProvider publishableKey={publishableKey}>
        <PostHogProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </PostHogProvider>
      </ClerkProvider>
    ),
    container,
  )
}

// Prerendered public pages contain DOM mutated by their animation libraries,
// so hydration cannot be reliable. Warm the matching route chunk before Solid
// replaces that DOM, preserving the existing no-blank-flash mount strategy.
const preload = container.firstElementChild
  ? preloadPrerenderedRoute(window.location.pathname)
  : undefined

if (preload) preload.then(mount, mount)
else mount()
