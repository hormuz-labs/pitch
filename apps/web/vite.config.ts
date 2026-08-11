import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../../',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Optimized dependency URLs are versioned, but a dependency install can
    // leave an already-open tab holding an old React/ReactDOM graph. Never let
    // browsers persist dev-server modules across optimizer restarts.
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
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
      '/r': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
