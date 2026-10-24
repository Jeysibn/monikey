import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // `@/components/...` means `src/components/...` (the alias shadcn/ui expects)
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
