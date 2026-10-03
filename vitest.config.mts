import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode || 'test', process.cwd(), '');
  // Also populate process.env for Node modules that read process.env directly
  Object.assign(process.env, env);

  if (!process.env.ENCRYPTION_SECRET) {
    process.env.ENCRYPTION_SECRET = 'test-environment-encryption-secret-minimum-32-chars!';
  }

  return {
    test: {
      environment: 'node',
      globals: true,
      fileParallelism: false,
      maxWorkers: 1,
      testTimeout: 45000,
      env: {
        ...env,
        ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET,
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  };
});
