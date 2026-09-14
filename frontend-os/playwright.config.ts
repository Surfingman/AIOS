import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 45000,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.AIOS_TEST_URL || 'http://127.0.0.1:8036',
    channel: 'msedge',
    headless: true,
    reducedMotion: 'no-preference',
    screenshot: 'only-on-failure',
  },
})