import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  bundle: true,
  clean: true,
  minify: false,
  banner: { js: '#!/usr/bin/env node' },
  outDir: 'dist',
})
