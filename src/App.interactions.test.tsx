import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'

/** 打开公众号可选接口配置，用于需要读写历史凭据的测试场景。 */
function openWechatApiSettings(): void {
  fireEvent.click(screen.getByRole('button', { name: '微信公众号' }))
  fireEvent.click(screen.getByText('接口发布（可选）', { exact: true }))
}

// 该文件补充 App 组件的交互分支：Web 环境降级、复制失败、复制标题/全部、预检警告与配置输入。
describe('Visual Muse 工作台交互分支', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete window.visualMuseStore
    delete window.visualMuseDesktop
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('Web 环境复制正文走 navigator.clipboard', async () => {
    // 剪贴板写入探针，用来验证无桌面 API 时降级到浏览器剪贴板。
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^掘金$/ }))
    fireEvent.click(screen.getByRole('button', { name: '复制正文' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('# Visual Muse 深色工作台')
      )
    )
    expect(await screen.findByText('正文已复制')).toBeInTheDocument()
  })

  test('复制标题只写入标题文本', async () => {
    // 剪贴板写入探针，用来断言复制标题时只传标题。
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^知乎$/ }))
    fireEvent.click(screen.getByRole('button', { name: '复制标题' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Visual Muse 深色工作台发布说明')
    )
    expect(await screen.findByText('标题已复制')).toBeInTheDocument()
  })

  test('复制标题和正文写入拼接内容', async () => {
    // 剪贴板写入探针，用来断言复制全部时标题和正文以空行拼接。
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^CSDN$/ }))
    fireEvent.click(screen.getByRole('button', { name: '复制标题和正文' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Visual Muse 深色工作台发布说明\n\n# Visual Muse 深色工作台/
        )
      )
    )
    expect(await screen.findByText('标题和正文已复制')).toBeInTheDocument()
  })

  test('剪贴板写入失败时提示错误', async () => {
    // 失败的剪贴板写入探针，用来覆盖 handleCopyContent 的 catch 分支。
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^CSDN$/ }))
    fireEvent.click(screen.getByRole('button', { name: '复制正文' }))

    expect(
      await screen.findByText('复制失败，请检查系统剪贴板权限')
    ).toBeInTheDocument()
  })

  test('Web 环境打开创作中心走 window.open', async () => {
    // window.open 探针，用来验证无桌面 API 时降级到浏览器新标签页。
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^今日头条$/ }))
    fireEvent.click(
      screen.getByRole('button', { name: '打开今日头条创作中心' })
    )

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://mp.toutiao.com/',
        '_blank',
        'noopener,noreferrer'
      )
    )
    expect(
      await screen.findByText('已打开今日头条创作中心')
    ).toBeInTheDocument()
  })

  test('打开创作中心失败时提示错误', async () => {
    // 抛错的 openPublisher 探针，用来覆盖 handleOpenPublisher 的 catch 分支。
    window.visualMuseDesktop = {
      copyText: vi.fn().mockResolvedValue(undefined),
      openPublisher: vi.fn().mockRejectedValue(new Error('blocked')),
    }

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^知乎$/ }))
    fireEvent.click(screen.getByRole('button', { name: '打开知乎创作中心' }))

    expect(
      await screen.findByText('无法打开创作中心，请稍后重试')
    ).toBeInTheDocument()
  })

  test('预检通过但缺封面时展示警告', async () => {
    render(<App />)

    // Markdown 输入框，用来粘贴一篇有标题、无封面、无插图的文章触发封面警告。
    const editor = await screen.findByLabelText('Markdown 编辑器')
    fireEvent.change(editor, {
      target: { value: '---\ntitle: 只有标题\n---\n\n纯文字正文' },
    })
    fireEvent.click(screen.getByRole('radio', { name: '平台设置' }))
    fireEvent.click(screen.getByRole('button', { name: '发布预检' }))

    expect(await screen.findByText('预检通过')).toBeInTheDocument()
    expect(screen.getByText('建议提供封面或正文首图')).toBeInTheDocument()
  })

  test('预检通过且无警告时展示可发布提示', async () => {
    render(<App />)

    // Markdown 输入框，用来粘贴一篇有标题且有封面的文章，覆盖无警告分支。
    const editor = await screen.findByLabelText('Markdown 编辑器')
    fireEvent.change(editor, {
      target: { value: '---\ntitle: 有封面\ncover: ./c.png\n---\n\n正文' },
    })
    fireEvent.click(screen.getByRole('radio', { name: '平台设置' }))
    fireEvent.click(screen.getByRole('button', { name: '发布预检' }))

    expect(
      await screen.findByText('当前文章可以进入发布流程')
    ).toBeInTheDocument()
  })

  test('修改微信 AppID 会更新输入框并自动保存', async () => {
    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    openWechatApiSettings()
    // AppID 输入框，通过 autocomplete 属性定位（antd Form.Item 的 label 未用 for 关联）。
    const appIdInput = document.querySelector<HTMLInputElement>(
      'input[autocomplete="username"]'
    )
    expect(appIdInput).not.toBeNull()
    fireEvent.change(appIdInput as HTMLInputElement, {
      target: { value: 'wx-app-123' },
    })

    expect(await screen.findByDisplayValue('wx-app-123')).toBeInTheDocument()
    // 业务场景：修改配置后延迟自动保存到 localStorage，等待写入完成再断言。
    await waitFor(() => {
      expect(window.localStorage.getItem('visual-muse-state')).toContain(
        'wx-app-123'
      )
    })
  })

  test('非微信平台可填写分类等内容选项', async () => {
    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^知乎$/ }))
    // 文章分类输入框，通过 placeholder 定位后验证 updateContentOption 更新对应平台选项。
    const categoryInput = screen.getByPlaceholderText('例如：前端')
    fireEvent.change(categoryInput, { target: { value: '前端工程' } })

    expect(await screen.findByDisplayValue('前端工程')).toBeInTheDocument()
  })

  test('Web 环境从 localStorage 恢复历史主题配置', async () => {
    // 预置的历史状态，用来覆盖 readBrowserState 成功解析并恢复浅色主题的分支。
    window.localStorage.setItem(
      'visual-muse-state',
      JSON.stringify({
        themeMode: 'light',
        settings: {
          appId: 'restored-id',
          appSecret: '',
          serverUrl: '',
          apiKey: '',
          proxyUrl: '',
          defaultTheme: 'default',
        },
      })
    )

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    openWechatApiSettings()
    expect(await screen.findByDisplayValue('restored-id')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-theme',
        'light'
      )
    )
  })

  test('Web 环境本地状态损坏时降级为默认配置', async () => {
    // 损坏的 JSON 字符串，用来覆盖 readBrowserState 的 catch 降级分支。
    window.localStorage.setItem('visual-muse-state', '{not-valid-json')

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    // 业务场景：解析失败时应回退到默认深色主题，而不是崩溃。
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-theme',
      'dark'
    )
  })

  test('桌面端修改配置会通过 setState 持久化', async () => {
    // 桌面状态写入探针，用来覆盖 savePersistedState 的桌面 setState 分支。
    const setState = vi.fn().mockResolvedValue(undefined)
    window.visualMuseStore = {
      getState: vi.fn().mockResolvedValue(null),
      setState,
    }

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    openWechatApiSettings()
    // AppID 输入框，通过 autocomplete 属性定位后修改以触发自动保存。
    const appIdInput = document.querySelector<HTMLInputElement>(
      'input[autocomplete="username"]'
    )
    fireEvent.change(appIdInput as HTMLInputElement, {
      target: { value: 'desktop-app' },
    })

    await waitFor(() =>
      expect(setState).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ appId: 'desktop-app' }),
        })
      )
    )
    delete window.visualMuseStore
  })

  test('缺少标题时批量准备被阻止且不调用真实平台', async () => {
    // 平台准备探针，用来确认三平台预检失败时不会打开任何官方编辑器。
    const preparePublisher = vi.fn()
    window.visualMuseDesktop = {
      copyText: vi.fn().mockResolvedValue(undefined),
      openPublisher: vi.fn().mockResolvedValue(undefined),
      preparePublisher,
    }
    render(<App />)

    // Markdown 输入框，用来粘贴既无 frontmatter 又无一级标题的文章，覆盖三平台阻断分支。
    const editor = await screen.findByLabelText('Markdown 编辑器')
    fireEvent.change(editor, { target: { value: '无标题正文' } })
    fireEvent.click(
      screen.getByRole('button', { name: '一键准备 3 个平台草稿' })
    )

    expect(
      await screen.findByText('已准备 0/3 个平台草稿，请处理异常项后重试')
    ).toBeInTheDocument()
    expect(preparePublisher).not.toHaveBeenCalled()
  })

  test('图片消息文章预览展示图片列表', async () => {
    render(<App />)

    // Markdown 输入框，用来粘贴图片消息触发 buildPreviewHtml 的 image 分支。
    const editor = await screen.findByLabelText('Markdown 编辑器')
    fireEvent.change(editor, {
      target: {
        value:
          '---\ntitle: 图片消息标题\ntype: image\n---\n\n![](./p1.png)\n\n图说',
      },
    })

    // 业务场景：图片消息在预览面板以列表展示图片路径，路径文本唯一可作断言锚点。
    expect(await screen.findByText('./p1.png')).toBeInTheDocument()
    // 预览面板的“图片消息”标签，用 getAllByText 兼容标题等多处同名文本。
    expect(screen.getAllByText('图片消息').length).toBeGreaterThan(0)
  })
})
