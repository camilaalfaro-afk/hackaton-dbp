import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vercel exposes the deployed commit at build time. Anywhere else the build is "dev".
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? ''
const buildSha = /^[0-9a-f]{7,40}$/.test(commitSha) ? commitSha.slice(0, 7) : 'dev'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
})
