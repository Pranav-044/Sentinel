import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      // Proxy API calls to the gateway during local dev
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_WS_URL ?? 'ws://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
})
