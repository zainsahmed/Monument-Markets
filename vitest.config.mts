import { defineConfig } from 'vitest/config'
import path from 'node:path'

const root = import.meta.dirname

export default defineConfig({
  resolve: { alias: { '@': root, 'server-only': path.join(root, 'tests/stubs/server-only.ts') } },
  test: { include: ['tests/**/*.test.ts', 'lib/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'], environment: 'node', testTimeout: 30000, fileParallelism: false },
})
