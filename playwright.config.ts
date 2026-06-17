import { defineConfig } from '@playwright/test';

const backendPort = process.env.PLAYWRIGHT_BACKEND_PORT ?? '47778';
const frontendPort = process.env.PLAYWRIGHT_FRONTEND_PORT ?? '3000';
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const corsOrigins = `${frontendUrl},http://localhost:${frontendPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: [/.*\.e2e\.ts$/, /contrast\.spec\.ts$/],
  timeout: 30000,
  use: { baseURL: frontendUrl },
  webServer: [
    {
      command: `ARRA_CORS_ORIGINS=${corsOrigins} ORACLE_PORT=${backendPort} PORT=${backendPort} bun run src/server.ts`,
      url: `${backendUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: `cd frontend && VITE_PORT=${frontendPort} FRONTEND_PROXY_TARGET=${backendUrl} bun run dev`,
      url: frontendUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
