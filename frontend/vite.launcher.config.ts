import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: { outDir: 'dist-launcher', rollupOptions: { input: 'launcher.html' } },
  server: {
    port: 5175,
    proxy: { '/__launcher': { target: 'http://127.0.0.1:4391', changeOrigin: true } },
  },
})
