import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode || 'test', process.cwd(), '');
  // Also populate process.env for Node modules that read process.env directly
  Object.assign(process.env, env);

  return {
    test: {
      environment: 'node',
      globals: true,
      fileParallelism: false,
      maxWorkers: 1,
      testTimeout: 45000,
      env,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  };
});
