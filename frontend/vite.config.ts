import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev proxy for the backend API (see backend/ and
    // MONIKEY_BACKEND_IMPLEMENTATION_PLAN.md §12.2). Mirrors the same-origin
    // `/api` proxy Nginx performs in Docker, so the frontend can call
    // relative `/api/v1/...` paths in both `npm run dev` and Docker without
    // branching on environment. No VITE_* variables are involved — the
    // backend's own env config controls everything the API needs.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
