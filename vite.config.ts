import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { zhenzhenProxyPlugin } from './src/server/zhenzhenProxy'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkgVersion = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')).version

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion),
    },
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
