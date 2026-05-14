import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Configuration Vitest — tests unitaires des libs pures TalmidApp.
 * Les tests sont dans /tests (exclu du build Next.js via tsconfig).
 * Lancement : npm test
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
