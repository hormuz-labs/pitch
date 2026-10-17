// The marketing site: every page is rendered to static HTML at build time,
// and the interactive parts hydrate as Solid islands.
import solid from '@astrojs/solid-js'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  site: 'https://trypitch.co',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [solid()],
  vite: {
    plugins: [tailwindcss()],
    // The pages read VITE_* values (API URL, carousel assets) set in Vercel.
    envPrefix: ['PUBLIC_', 'VITE_'],
    resolve: {
      alias: {
        '@solidjs/router': fileURLToPath(new URL('./src/shims/router.tsx', import.meta.url)),
      },
    },
    ssr: { noExternal: ['lucide-solid'] },
  },
})
