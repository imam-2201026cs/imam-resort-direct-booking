import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/resort_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  },
});
