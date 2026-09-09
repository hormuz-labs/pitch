import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// https://vite.dev/config/
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  envDir: '../../',
  // Dashboard-only dependencies live behind lazy route imports. Pre-bundle
  // them at startup so opening /dashboard cannot trigger a second optimizer
  // pass that invalidates module URLs already loaded by the browser.
  optimizeDeps: {
    include: ['@clerk/clerk-js', '@solidjs/router', 'solid-js'],
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) only supports the function form of manualChunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/]@clerk[\\/]/.test(id)) return 'vendor-clerk'
          if (/[\\/]node_modules[\\/](gsap)[\\/]/.test(id)) return 'vendor-gsap'
          if (/[\\/]node_modules[\\/]posthog-js[\\/]/.test(id)) return 'vendor-posthog'
          if (/[\\/]node_modules[\\/](solid-js|@solidjs)[\\/]/.test(id)) return 'vendor-solid'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
    dedupe: ['solid-js'],
  },
  server: {
    // Never let browsers persist dev-server modules across optimizer restarts.
    headers: {
      'Cache-Control': 'no-store',
    },
    // This checkout contains enough source/public assets to exhaust the default
    // Linux inotify quota when other editors and dev servers are open. Polling
    // keeps HMR working without requiring machine-wide sysctl changes or sudo.
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      // All API traffic — including the VNC WebSocket proxy at
      // /browser/profiles/:id/vnc — goes to the local API. ws:true upgrades the
      // VNC connection; the API handles manager auth and Origin stripping, so
      // there's nothing manager-specific to configure here.
      // Anchored with a trailing slash on purpose. A bare '/api' key is a prefix
      // match, so it also swallowed the SPA route /api-keys and rewrote it to
      // /-keys on the API. Every real call is API_URL + '/path', so requiring
      // the slash costs nothing.
      '^/api/': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
      // Same reasoning: referral links are /r/<code>, and a bare '/r' would
      // capture any future route starting with those characters.
      '^/r/': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/d/': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
})
