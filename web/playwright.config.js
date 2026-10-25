import { defineConfig, devices } from '@playwright/test';
import {
  BACKEND_PORT,
  E2E_DATABASE,
  FRONTEND_PORT,
  SCRIPTS_DIR,
} from './test/e2e/support/harness.js';

const backendOrigin = `http://127.0.0.1:${BACKEND_PORT}`;
const frontendOrigin = `http://127.0.0.1:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.js',
  retries: 0,
  forbidOnly: true,
  globalSetup: './test/e2e/support/global-setup.js',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: frontendOrigin, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `bash ${SCRIPTS_DIR}run-e2e-backend.sh --database ${E2E_DATABASE}`,
      url: `${backendOrigin}/actuator/health`,
      env: { BOOKSNAP_E2E_BACKEND_PORT: String(BACKEND_PORT) },
      reuseExistingServer: false,
      timeout: 300_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      stderr: 'pipe',
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      url: `${frontendOrigin}/`,
      env: { BOOKSNAP_API_ORIGIN: backendOrigin, VITE_API_BASE_URL: '' },
      reuseExistingServer: false,
    },
  ],
});
