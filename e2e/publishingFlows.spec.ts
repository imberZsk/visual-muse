import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { museTest } from './helpers/electronApp'

// selectPlatform 从左侧发布平台栏切换目标平台。
async function selectPlatform(page: Page, platformName: string) {
  await page.getByRole('button', { name: platformName, exact: true }).click()
}

museTest('首屏展示品牌、工作台和三栏业务区域', async (page) => {
  await expect(
    page.getByRole('heading', { name: 'Visual Muse', exact: true })
  ).toBeVisible()
  await expect(page.getByLabel('发布平台')).toBeVisible()
  await expect(page.getByLabel('文章编辑工作区')).toBeVisible()
  await expect(page.getByLabel('发布配置')).toBeVisible()
})

museTest('左侧展示全部六个发布平台', async (page) => {
  for (const platform of [
    '微信公众号',
    '知乎',
    '今日头条',
    '掘金',
    'CSDN',
    'Medium',
  ]) {
    await expect(
      page.getByRole('button', { name: platform, exact: true })
    ).toBeVisible()
  }
})

museTest('默认加载示例 Markdown 与文章标题', async (page) => {
  await expect(page.getByLabel('Markdown 编辑器')).toContainText(
    'Visual Muse 深色工作台'
  )
  await expect(
    page
      .locator('header')
      .getByRole('heading', { name: 'Visual Muse 深色工作台发布说明' })
  ).toBeVisible()
})

museTest('默认预览展示作者与正文结构', async (page) => {
  const preview = page.getByLabel('发布预览')
  await expect(preview.getByText('Visual Muse', { exact: true })).toBeVisible()
  await expect(preview.getByRole('heading', { name: '发布目标' })).toBeVisible()
})

museTest('编辑 Markdown 会实时更新标题和预览正文', async (page) => {
  await page
    .getByLabel('Markdown 编辑器')
    .fill(
      '---\ntitle: 新文章\nauthor: 测试作者\n---\n\n# 新正文\n\n实时预览内容'
    )
  await expect(
    page.getByRole('heading', { name: '新文章' }).first()
  ).toBeVisible()
  await expect(
    page.getByLabel('发布预览').getByText('实时预览内容')
  ).toBeVisible()
})

museTest('编辑 Markdown 后字数统计同步更新', async (page) => {
  await page.getByLabel('Markdown 编辑器').fill('---\ntitle: 标题\n---\n12345')
  await expect(page.getByText('5 字')).toBeVisible()
})

museTest('主题开关可从深色切换为浅色', async (page) => {
  await page.getByRole('switch', { name: '主题切换' }).click()
  await expect(page.getByTestId('app-shell')).toHaveAttribute(
    'data-theme',
    'light'
  )
})

museTest('浅色主题会通过真实 IPC 持久化并在刷新后恢复', async (page) => {
  await page.getByRole('switch', { name: '主题切换' }).click()
  await expect
    .poll(async () => page.evaluate(() => window.visualMuseStore?.getState()))
    .toMatchObject({ themeMode: 'light' })
  await page.reload()
  await expect(page.getByTestId('app-shell')).toHaveAttribute(
    'data-theme',
    'light'
  )
})

museTest('微信公众号展示五项凭据配置与排版主题', async (page) => {
  for (const label of [
    'AppID',
    'AppSecret',
    'Server',
    'API Key',
    '代理',
    '默认主题',
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible()
  }
})

museTest('微信公众号配置通过真实 IPC 自动保存并在刷新后回显', async (page) => {
  await page.getByLabel('AppID', { exact: true }).fill('e2e-app-id')
  await expect
    .poll(async () => page.evaluate(() => window.visualMuseStore?.getState()))
    .toMatchObject({ settings: { appId: 'e2e-app-id' } })
  await page.reload()
  await expect(page.getByLabel('AppID', { exact: true })).toHaveValue(
    'e2e-app-id'
  )
})

museTest(
  '敏感凭据使用系统安全存储加密落盘并可解密回显',
  async (page, _app, userDataPath) => {
    // 测试凭据，保存仅用于隔离 userData 的可识别明文。
    const appSecret = 'e2e-wechat-secret'
    // 模型密钥，保存工作区加密路径的可识别明文。
    const modelApiKey = 'e2e-model-secret'
    await page.getByLabel('AppSecret', { exact: true }).fill(appSecret)
    await expect
      .poll(async () => page.evaluate(() => window.visualMuseStore?.getState()))
      .toMatchObject({ settings: { appSecret } })
    await page.evaluate(async (apiKey) => {
      // 工作区接口，保存调用真实主进程持久化所需的 preload API。
      const workspaceApi = window.visualMuseWorkspace
      if (!workspaceApi) throw new Error('工作区 API 不可用')
      // 当前工作区，保存加入测试模型前的完整合法状态。
      const currentState = await workspaceApi.getState()
      if (!currentState) throw new Error('当前工作区为空')
      await workspaceApi.setState({
        ...currentState,
        models: [
          {
            id: 'model-e2e',
            name: 'E2E',
            baseUrl: 'https://example.com/v1',
            model: 'test',
            apiKey,
            mode: 'api',
          },
        ],
      })
    }, modelApiKey)
    // 发布状态原文，保存真实磁盘 JSON 供明文泄漏检查。
    const publisherFile = await readFile(
      path.join(userDataPath, 'visual-muse-state.json'),
      'utf-8'
    )
    // 工作区原文，保存真实磁盘 JSON 供模型密钥泄漏检查。
    const workspaceFile = await readFile(
      path.join(userDataPath, 'visual-muse-workspace.json'),
      'utf-8'
    )
    expect(publisherFile).not.toContain(appSecret)
    expect(workspaceFile).not.toContain(modelApiKey)
    expect(publisherFile).toContain('visual-muse-secure:v1:')
    expect(workspaceFile).toContain('visual-muse-secure:v1:')
    await page.reload()
    await expect(page.getByLabel('AppSecret', { exact: true })).toHaveValue(
      appSecret
    )
  }
)

museTest('公众号排版主题可切换为 Orange Heart', async (page) => {
  await page.getByLabel('默认主题', { exact: true }).click()
  await page.getByText('Orange Heart', { exact: true }).click()
  await expect(
    page
      .getByLabel('发布配置')
      .getByText('Orange Heart', { exact: true })
      .last()
  ).toBeVisible()
})

museTest('默认文章微信公众号发布预检通过', async (page) => {
  await page.getByRole('button', { name: '发布预检' }).click()
  await expect(page.getByText('预检通过')).toBeVisible()
})

museTest('缺失标题时预检阻止发布并展示原因', async (page) => {
  await page.getByLabel('Markdown 编辑器').fill('没有标题的正文')
  await page.getByRole('button', { name: '发布预检' }).click()
  await expect(page.getByText('预检未通过')).toBeVisible()
  await expect(page.getByText(/标题/).last()).toBeVisible()
})

museTest('预检通过后模拟发布生成发布记录', async (page) => {
  await page.getByRole('button', { name: '模拟发布' }).click()
  await expect(page.getByText('发布模拟成功')).toBeVisible()
  await expect(page.getByText(/mock_wechat_/)).toBeVisible()
})

museTest('模拟发布进行中禁用重复提交', async (page) => {
  const publishButton = page.getByRole('button', { name: '模拟发布' })
  await publishButton.click()
  await expect(publishButton).toBeDisabled()
  await expect(page.getByText('发布模拟成功')).toBeVisible()
})

museTest('切换知乎后展示内容准备表单和复制动作', async (page) => {
  await selectPlatform(page, '知乎')
  await expect(page.getByText('知乎内容准备')).toBeVisible()
  await expect(page.getByPlaceholder('例如：前端')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '复制标题', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '打开知乎创作中心' })
  ).toBeVisible()
})

museTest('知乎复制标题使用真实桌面剪贴板并显示反馈', async (page) => {
  await selectPlatform(page, '知乎')
  await page.getByRole('button', { name: '复制标题', exact: true }).click()
  await expect(page.getByText('标题已复制')).toBeVisible()
})

museTest('知乎复制正文显示成功反馈', async (page) => {
  await selectPlatform(page, '知乎')
  await page.getByRole('button', { name: '复制正文' }).click()
  await expect(page.getByText('正文已复制')).toBeVisible()
})

museTest('知乎复制标题和正文显示成功反馈', async (page) => {
  await selectPlatform(page, '知乎')
  await page.getByRole('button', { name: '复制标题和正文' }).click()
  await expect(page.getByText('标题和正文已复制')).toBeVisible()
})

museTest('各平台的分类标签摘要状态相互隔离', async (page) => {
  await selectPlatform(page, '知乎')
  await page.getByPlaceholder('例如：前端').fill('技术')
  await page.getByPlaceholder('多个标签用逗号分隔').fill('React,TypeScript')
  await selectPlatform(page, '今日头条')
  await expect(page.getByPlaceholder('例如：前端')).toHaveValue('')
  await selectPlatform(page, '知乎')
  await expect(page.getByPlaceholder('例如：前端')).toHaveValue('技术')
})

museTest('今日头条切换后标题、说明和入口同步更新', async (page) => {
  await selectPlatform(page, '今日头条')
  await expect(page.getByText('今日头条内容准备')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '打开今日头条创作中心' })
  ).toBeVisible()
})

museTest('掘金切换后标题、说明和入口同步更新', async (page) => {
  await selectPlatform(page, '掘金')
  await expect(page.getByText('掘金内容准备')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '打开掘金创作中心' })
  ).toBeVisible()
})

museTest('CSDN 切换后标题、说明和入口同步更新', async (page) => {
  await selectPlatform(page, 'CSDN')
  await expect(page.getByText('CSDN内容准备')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '打开CSDN创作中心' })
  ).toBeVisible()
})

museTest('Medium 切换后标题、说明和入口同步更新', async (page) => {
  await selectPlatform(page, 'Medium')
  await expect(page.getByText('Medium内容准备')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '打开Medium创作中心' })
  ).toBeVisible()
})

museTest('从其它平台返回公众号后恢复公众号配置表单', async (page) => {
  await selectPlatform(page, '知乎')
  await selectPlatform(page, '微信公众号')
  await expect(page.getByLabel('AppID', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '模拟发布' })).toBeVisible()
})

museTest('桌面默认尺寸下三栏边界互不重叠', async (page) => {
  const platformBox = await page.getByLabel('发布平台').boundingBox()
  const workspaceBox = await page.getByLabel('文章编辑工作区').boundingBox()
  const publishBox = await page.getByLabel('发布配置').boundingBox()
  expect(platformBox).not.toBeNull()
  expect(workspaceBox).not.toBeNull()
  expect(publishBox).not.toBeNull()
  expect(platformBox!.x + platformBox!.width).toBeLessThanOrEqual(
    workspaceBox!.x
  )
  expect(workspaceBox!.x + workspaceBox!.width).toBeLessThanOrEqual(
    publishBox!.x
  )
})

museTest('功能导航可进入工作台并展示创作统计', async (page) => {
  await page.getByRole('button', { name: '工作台', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '工作台', exact: true })
  ).toBeVisible()
  await expect(page.getByText('今日记录', { exact: true })).toBeVisible()
  await expect(page.getByText('本地文稿', { exact: true })).toBeVisible()
})

museTest('文章编辑支持纯预览和返回纯编辑', async (page) => {
  await page.getByText('纯预览', { exact: true }).click()
  await expect(page.getByLabel('Markdown 编辑器')).toBeHidden()
  await expect(page.getByLabel('发布预览')).toBeVisible()
  await page.getByText('纯编辑', { exact: true }).click()
  await expect(page.getByLabel('Markdown 编辑器')).toBeVisible()
  await expect(page.getByLabel('发布预览')).toBeHidden()
})

museTest('图文编辑手动拆分四张卡片并切换主题', async (page) => {
  await page.getByRole('button', { name: '图文编辑', exact: true }).click()
  await page
    .getByLabel('图文 Markdown 编辑器')
    .fill('第一张\n---\n第二张\n---\n第三张\n---\n第四张')
  await expect(page.getByText('4 张', { exact: true })).toBeVisible()
  await expect(page.getByText('CARD 4', { exact: true })).toBeVisible()
  await page.getByLabel('图文主题').click()
  await page.getByText('终端记录', { exact: true }).click()
  const themeSelect = page
    .locator('.studio-toolbar .ant-select')
    .filter({ has: page.getByLabel('图文主题') })
  await expect(themeSelect.getByText('终端记录', { exact: true })).toBeVisible()
})

museTest('内容管理保存历史版本并可查看', async (page) => {
  await page.getByRole('button', { name: '打开内容管理' }).click()
  await expect(page.getByText('内容管理', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存版本', exact: true }).click()
  await expect(page.getByText('已保存历史版本')).toBeVisible()
  await page.getByRole('button', { name: '历史', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '历史版本' })).toBeVisible()
  await expect(
    page
      .getByRole('dialog', { name: '历史版本' })
      .getByRole('button', { name: /恢\s*复/ })
  ).toBeVisible()
})

museTest('设置页可以通过真实 IPC 复制 Codex MCP 配置', async (page, app) => {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page
    .getByRole('button', { name: '复制 Codex 配置', exact: true })
    .click()
  // 剪贴板内容，保存真实主进程生成并通过受限 IPC 写入的 TOML。
  const clipboardText = await app.evaluate(({ clipboard }) =>
    clipboard.readText()
  )
  expect(clipboardText).toContain('[mcp_servers.visual-muse]')
  expect(clipboardText).toContain('VISUAL_MUSE_DATA_DIR')
})

museTest('工作区并发自动保存按调用顺序原子落盘', async (page) => {
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean(await window.visualMuseWorkspace?.getState())
      )
    )
    .toBe(true)
  // 最终标记，保存并发写入队列最后一次调用应落盘的值。
  const finalMarker = await page.evaluate(async () => {
    // 工作区 API，保存 preload 暴露的真实 IPC 接口。
    const workspaceApi = window.visualMuseWorkspace
    if (!workspaceApi) throw new Error('工作区 API 不可用')
    // 当前工作区，保存并发写入需要复用的完整合法状态。
    const currentState = await workspaceApi.getState()
    if (!currentState) throw new Error('当前工作区为空')
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        workspaceApi.setState({
          ...currentState,
          settings: { ...currentState.settings, concurrentWriteMarker: index },
        })
      )
    )
    // 磁盘状态，保存所有并发 IPC 完成后的最终 JSON。
    const storedState = await workspaceApi.getState()
    return (
      storedState?.settings as typeof currentState.settings & {
        concurrentWriteMarker?: number
      }
    ).concurrentWriteMarker
  })
  expect(finalMarker).toBe(11)
})
