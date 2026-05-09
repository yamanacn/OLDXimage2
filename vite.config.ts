import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { zhenzhenProxyPlugin } from './src/server/zhenzhenProxy'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      zhenzhenProxyPlugin(env),
    ],
    server: {
      watch: {
        ignored: ['**/output/**'],
      },
    },
  }
})
