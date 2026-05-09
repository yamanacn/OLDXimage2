import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

const nodeBuiltins = builtinModules.flatMap(name => [name, `node:${name}`])

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: 'src/server/electronRuntime.ts',
      formats: ['es'],
      fileName: () => 'electronRuntime.js',
    },
    outDir: 'build-server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      external: nodeBuiltins,
    },
  },
})
