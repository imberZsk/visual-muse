import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// PROJECT_ROOT 存储 Electron 启动所需的项目绝对路径。
const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..')

// museTest 为每条用例创建隔离 userData 的真实 Electron 应用并在结束时清理。
export function museTest(
  title: string,
  run: (
    page: Page,
    app: ElectronApplication,
    userDataPath: string
  ) => Promise<void>
) {
  test(title, async () => {
    // userDataPath 存储当前用例隔离的应用配置目录。
    const userDataPath = await mkdtemp(
      path.join(os.tmpdir(), 'visual-muse-e2e-')
    )
    // app 存储当前用例的 Electron 应用实例。
    const app = await electron.launch({
      args: [PROJECT_ROOT, `--user-data-dir=${userDataPath}`],
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // 所有 Electron E2E 隐藏主窗口，禁止抢占用户桌面焦点。
        VISUAL_MUSE_HEADLESS: '1',
      },
    })
    // page 存储应用主窗口对应的 Playwright 页面。
    const page = await app.firstWindow()
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByLabel('Markdown 编辑器')).toBeVisible()
    try {
      await run(page, app, userDataPath)
    } finally {
      await app.close()
      await rm(userDataPath, { recursive: true, force: true })
    }
  })
}
