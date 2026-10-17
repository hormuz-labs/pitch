import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const daemon = process.env.OD_DAEMON ?? 'http://127.0.0.1:7456';

export default defineConfig({
  plugins: [solid()],
  server: { port: 5173, proxy: { '/api': { target: daemon, changeOrigin: false } } },
  build: { target: 'es2022' },
});
