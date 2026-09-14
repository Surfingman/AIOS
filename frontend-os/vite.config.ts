import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/os/',
  server: { host: '127.0.0.1', port: 5176, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8035', '/workspace': 'http://127.0.0.1:8035', '/assets': 'http://127.0.0.1:8035' } },
  plugins: [react()],
})
