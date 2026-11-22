import { defineConfig, devices } from '@playwright/test';

/**
 * Uçtan uca testler gerçek API + web sunucusuna karşı, ayrı bir veritabanında (otoyikama_e2e) çalışır.
 * Veritabanı kalıcıdır: testler rastgele plaka üretir, mevcut veriyi silmez.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://otoyikama:otoyikama@localhost:5432/otoyikama_e2e';
const apiEnv = { DATABASE_URL: E2E_DB, PORT: '3100', NODE_ENV: 'test', LOGIN_RATE_LIMIT: '1000', API_RATE_LIMIT: '100000', NOTIFY_WORKER: 'off' };

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:5199', locale: 'tr-TR', timezoneId: 'Europe/Istanbul' },
  projects: [
    { name: 'masaustu', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: [
    {
      // Veritabanını hazırla (migration + seed), sonra API'yi başlat.
      command:
        'npx prisma migrate deploy && npx tsx prisma/seed.ts && node -r @swc-node/register src/main.ts',
      cwd: '../api',
      env: apiEnv,
      url: 'http://localhost:3100/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 5199 --strictPort',
      cwd: '../web',
      env: { VITE_API_TARGET: 'http://localhost:3100' },
      url: 'http://localhost:5199',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
