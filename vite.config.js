import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 3000 },
  build: {
    sourcemap: mode !== 'production',
    rollupOptions: {
      output: {
        // F1: separar el SDK de Supabase (~300 KB) en su propio chunk cacheable.
        // No cambia con cada deploy del código de la app, así que el cliente
        // lo descarga una sola vez y reusa entre versions.
        manualChunks: {
          'supabase': ['@supabase/supabase-js'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    // Sube el warning a 600 KB: el chunk de supabase legítimamente pesa ~300 KB.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
}))
