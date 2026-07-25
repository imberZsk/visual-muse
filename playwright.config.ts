import { defineConfig } from '@playwright/test'

// Playwright 配置串行运行 Electron 用例，避免桌面窗口和系统剪贴板互相干扰。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})
