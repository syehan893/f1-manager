import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The race feed can be pointed at a Node/Express backend later:
    //   VITE_RACE_WS_URL=ws://localhost:4000/race
    // proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
})
