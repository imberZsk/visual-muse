import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { museTest } from './helpers/electronApp'

/** capturePage 截取当前隐藏 Electron 页面并保留为 UI 验收附件。 */
async function capturePage(
  page: Page,
  testInfo: TestInfo,
  screenshotName: string
): Promise<void> {
  // screenshotPath 存储当前截图在 Playwright 用例输出目录中的路径。
  const screenshotPath = testInfo.outputPath(`${screenshotName}.png`)
  await page.screenshot({ path: screenshotPath, animations: 'disabled' })
  await testInfo.attach(screenshotName, {
    path: screenshotPath,
    contentType: 'image/png',
  })
}

/** assertStableLayout 验证根工作台没有横向溢出或视口外裁切。 */
async function assertStableLayout(page: Page): Promise<void> {
  // layoutMetrics 存储文档和工作台边界，用于捕获截图不易发现的横向溢出。
  const layoutMetrics = await page.evaluate(() => {
    // appShell 存储工作台根布局元素。
    const appShell = document.querySelector<HTMLElement>('.app-shell')
    // shellBounds 存储工作台相对视口的位置和宽度。
    const shellBounds = appShell?.getBoundingClientRect()

    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      shellLeft: shellBounds?.left ?? -1,
      shellRight: shellBounds?.right ?? -1,
    }
  })

  expect(layoutMetrics.scrollWidth).toBe(layoutMetrics.clientWidth)
  expect(layoutMetrics.shellLeft).toBeGreaterThanOrEqual(0)
  expect(layoutMetrics.shellRight).toBeLessThanOrEqual(
    layoutMetrics.clientWidth
  )
}

/** assertDesktopDensity 验证默认桌面窗口使用规范定义的左右栏和标题尺寸。 */
async function assertDesktopDensity(page: Page): Promise<void> {
  // densityMetrics 存储左右栏与标题的实际计算尺寸。
  const densityMetrics = await page.evaluate(() => {
    // platformRail 存储左侧发布平台栏。
    const platformRail = document.querySelector<HTMLElement>('.platform-rail')
    // publishPanel 存储右侧发布配置栏。
    const publishPanel = document.querySelector<HTMLElement>('.publish-panel')
    // workspaceTitle 存储工作台主标题。
    const workspaceTitle = document.querySelector<HTMLElement>(
      '.workspace-header h2'
    )

    return {
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      platformRailWidth: platformRail?.getBoundingClientRect().width ?? -1,
      publishPanelWidth: publishPanel?.getBoundingClientRect().width ?? -1,
      workspaceTitleSize: workspaceTitle
        ? Number.parseFloat(getComputedStyle(workspaceTitle).fontSize)
        : -1,
    }
  })

  expect(densityMetrics.platformRailWidth).toBe(200)
  expect(densityMetrics.publishPanelWidth).toBe(320)
  expect(densityMetrics.workspaceTitleSize).toBe(20)
  expect(densityMetrics.scrollHeight).toBe(densityMetrics.clientHeight)
}

/** readButtonDensity 读取可见 Ant Design 按钮的最终高度、字号和横向内边距。 */
async function readButtonDensity(button: Locator) {
  return button.evaluate((element) => {
    // style 存储浏览器计算后的最终按钮样式。
    const style = getComputedStyle(element)
    return {
      height: Number.parseFloat(style.height),
      fontSize: Number.parseFloat(style.fontSize),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
    }
  })
}

/** assertVisualWorktreeButtonDensity 验证普通操作按钮使用 Visual Worktree 的默认密度。 */
async function assertVisualWorktreeButtonDensity(page: Page): Promise<void> {
  // actionDensity 存储发布配置区常规操作按钮的最终几何尺寸。
  const actionDensity = await readButtonDensity(
    page.getByRole('button', { name: '发布预检' })
  )
  expect(actionDensity).toEqual({
    height: 32,
    fontSize: 14,
    paddingLeft: 15,
    paddingRight: 15,
  })
  // platformDensity 存储平台导航按钮收敛后的高度和字号。
  const platformDensity = await readButtonDensity(
    page.getByRole('button', { name: '微信公众号', exact: true })
  )
  expect(platformDensity.height).toBe(32)
  expect(platformDensity.fontSize).toBe(13)
}

museTest('关键发布工作区生成 UI 验收截图', async (page, _app, testInfo) => {
  await expect(page.locator('.brand-lockup svg')).toHaveCount(0)
  await assertStableLayout(page)
  await assertDesktopDensity(page)
  await capturePage(page, testInfo, 'wechat-distribution-dark')

  await page.getByText('平台设置', { exact: true }).click()
  await assertVisualWorktreeButtonDensity(page)
  await capturePage(page, testInfo, 'wechat-settings-dark')

  await page.getByRole('button', { name: '掘金', exact: true }).click()
  await expect(page.getByPlaceholder('例如：前端')).toBeVisible()
  await assertStableLayout(page)
  await capturePage(page, testInfo, 'juejin-dark')

  await page.getByRole('switch', { name: '主题切换' }).click()
  await expect(page.getByTestId('app-shell')).toHaveAttribute(
    'data-theme',
    'light'
  )
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await assertStableLayout(page)
  await capturePage(page, testInfo, 'juejin-light')

  // 最小窗口用于验收发布配置下移后编辑区仍可用且页面没有横向溢出。
  await page.setViewportSize({ width: 1120, height: 720 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await assertStableLayout(page)
  await capturePage(page, testInfo, 'juejin-min-window-light')
})

museTest('桌面右侧设置区可滚动且主操作始终可达', async (page) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('button', { name: '微信公众号', exact: true }).click()
  await page.getByText('接口发布（可选）', { exact: true }).click()
  await expect(page.getByLabel('AppID', { exact: true })).toBeVisible()

  // publishPanelScroll 存储唯一的右侧内容滚动容器。
  const publishPanelScroll = page.getByTestId('publish-panel-scroll')
  // 业务场景：等待折叠动画结束后再测量，避免把过渡阶段的零高度误判为不可滚动。
  await expect
    .poll(() =>
      publishPanelScroll.evaluate(
        (element) => element.scrollHeight - element.clientHeight
      )
    )
    .toBeGreaterThan(0)
  // scrollMetrics 存储展开接口配置后的可视高度和完整内容高度。
  const scrollMetrics = await publishPanelScroll.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }))
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight)
  expect(scrollMetrics.scrollTop).toBe(0)

  await publishPanelScroll.hover()
  await page.mouse.wheel(0, 480)
  await expect
    .poll(() => publishPanelScroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
  await expect(
    page.getByRole('button', { name: '准备微信公众号草稿' })
  ).toBeVisible()
})
