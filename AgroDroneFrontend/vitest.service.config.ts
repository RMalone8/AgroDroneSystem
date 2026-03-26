import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node — pure MQTT I/O tests need it.
    // Individual files can override with @vitest-environment jsdom.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/service-tests/**/*.service.test.{ts,tsx}'],
    testTimeout: 10000,
  },
});
