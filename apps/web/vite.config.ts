import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../../',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom']
  },
  server: {
    proxy: {
      '/manager-api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/manager-api/, '/api'),
      },
      '/api/profiles': {
        target: 'ws://127.0.0.1:8080',
        ws: true,
        changeOrigin: true,
        configure(proxy) {
          // Manager enforces CSWSH protection (main.py:_check_websocket_origin):
          // origin must match host, otherwise it 4403s. We forward the same host
          // but the Vite dev server's origin (e.g. http://localhost:5173) won't
          // match the manager's 127.0.0.1:8080. Strip Origin on the WebSocket
          // upgrade so the manager treats us as a non-browser client and allows.
          proxy.on('proxyReqWs', (proxyReq) => {
            proxyReq.removeHeader('origin');
          });
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
          });
        },
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/r': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
