import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Serveur FastAPI du PC (backend/__main__.py). */
const API = 'http://127.0.0.1:4330'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        // Le serveur refuse une origine différente de son hôte : en développement, l'origine devient celle du serveur.
        headers: { origin: API },
      },
    },
  },
})
