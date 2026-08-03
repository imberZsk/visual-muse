import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'

/** 打开公众号可选接口配置，用于需要读写历史凭据的测试场景。 */
function openWechatApiSettings(): void {
  fireEvent.click(screen.getByRole('button', { name: '微信公众号' }))
  fireEvent.click(screen.getByText('接口发布（可选）', { exact: true }))
}

describe('Visual Muse 工作台', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete window.visualMuseStore
    delete window.visualMuseDesktop
  })

  test('默认使用深色主题并展示参考平台', async () => {
    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-theme',
      'dark'
    )
    expect(
      screen.getByRole('button', { name: '微信公众号' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '小红书' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '知乎' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '今日头条' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CSDN' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Medium' })
    ).not.toBeInTheDocument()
  })

  test('可以切换浅色主题', async () => {
    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('switch', { name: '主题切换' }))

    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-theme',
      'light'
    )
  })

  test('右侧默认聚焦批量分发并可从任务行直达平台设置', async () => {
    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    expect(screen.getByRole('radio', { name: '批量分发' })).toBeChecked()
    expect(screen.getByLabelText('三平台分发计划')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看掘金设置' }))

    expect(screen.getByRole('radio', { name: '平台设置' })).toBeChecked()
    expect(screen.getByText('掘金设置')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '准备掘金草稿' })
    ).toBeInTheDocument()
  })

  test('切换平台后展示对应发布能力', async () => {
    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^知乎$/ }))

    expect(screen.getByText(/适配知乎编辑器/)).toBeInTheDocument()
    expect(screen.getByText('知乎设置')).toBeInTheDocument()
    expect(screen.queryByLabelText('AppID')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '打开知乎创作中心' })
    ).toBeInTheDocument()
  })

  test('掘金可以复制正文且不需要账号凭据', async () => {
    // 剪贴板写入探针，用来验证桌面端只接收文章内容。
    const copyText = vi.fn().mockResolvedValue(undefined)

    window.visualMuseDesktop = {
      copyText,
      openPublisher: vi.fn().mockResolvedValue(undefined),
    }

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^掘金$/ }))
    fireEvent.click(screen.getByRole('button', { name: '复制正文' }))

    await waitFor(() =>
      expect(copyText).toHaveBeenCalledWith(
        expect.stringContaining('# Visual Muse 深色工作台')
      )
    )
    expect(screen.getByText('掘金设置')).toBeInTheDocument()
    expect(screen.queryByLabelText('AppID')).not.toBeInTheDocument()
  })

  test('掘金通过白名单 API 打开创作中心', async () => {
    // 创作入口探针，用来验证渲染进程只传递平台 ID。
    const openPublisher = vi.fn().mockResolvedValue(undefined)

    window.visualMuseDesktop = {
      copyText: vi.fn().mockResolvedValue(undefined),
      openPublisher,
    }

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^掘金$/ }))
    fireEvent.click(screen.getByRole('button', { name: '打开掘金创作中心' }))

    await waitFor(() => expect(openPublisher).toHaveBeenCalledWith('juejin'))
  })

  test('掘金把文章和平台选项提交给持久发布会话', async () => {
    // 平台填充探针，用来验证渲染层提交经过预检的结构化文章数据。
    const preparePublisher = vi.fn().mockResolvedValue({
      status: 'prepared',
      platformId: 'juejin',
      message: '文章已填入掘金编辑器',
      url: 'https://juejin.cn/editor/drafts/new?v=2',
    })

    window.visualMuseDesktop = {
      copyText: vi.fn().mockResolvedValue(undefined),
      openPublisher: vi.fn().mockResolvedValue(undefined),
      preparePublisher,
    }

    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: /^掘金$/ }))
    fireEvent.change(screen.getByPlaceholderText('例如：前端'), {
      target: { value: '前端' },
    })
    fireEvent.change(screen.getByPlaceholderText('多个标签用逗号分隔'), {
      target: { value: 'Electron,效率工具' },
    })
    fireEvent.click(screen.getByRole('button', { name: '准备掘金草稿' }))

    await waitFor(() =>
      expect(preparePublisher).toHaveBeenCalledWith(
        expect.objectContaining({
          platformId: 'juejin',
          title: 'Visual Muse 深色工作台发布说明',
          markdown: expect.stringContaining('# Visual Muse 深色工作台'),
          category: '前端',
          tags: ['Electron', '效率工具'],
        })
      )
    )
    expect(await screen.findByText('文章已填入掘金编辑器')).toBeInTheDocument()
  })

  test('缺少标题时预检展示错误', async () => {
    render(<App />)

    // Markdown 输入框，用来模拟用户粘贴一篇没有 frontmatter 和一级标题的文章。
    const editor = await screen.findByLabelText('Markdown 编辑器')
    fireEvent.change(editor, { target: { value: '没有标题\n\n正文' } })
    fireEvent.click(screen.getByRole('radio', { name: '平台设置' }))
    fireEvent.click(screen.getByRole('button', { name: '发布预检' }))

    expect(screen.getByText('缺少文章标题')).toBeInTheDocument()
  })

  test('没有 frontmatter 时使用一级标题填入真实编辑器', async () => {
    // 平台填充探针，用来验证渲染层提交正文一级标题而不是阻止发布。
    const preparePublisher = vi.fn().mockResolvedValue({
      status: 'prepared',
      platformId: 'juejin',
      message: '文章已填入掘金编辑器',
      url: 'https://juejin.cn/editor/drafts/new?v=2',
    })
    window.visualMuseDesktop = {
      copyText: vi.fn().mockResolvedValue(undefined),
      openPublisher: vi.fn().mockResolvedValue(undefined),
      preparePublisher,
    }
    render(<App />)

    // Markdown 输入框，用来粘贴只有标准一级标题的文章。
    const editor = await screen.findByLabelText('Markdown 编辑器')
    fireEvent.change(editor, {
      target: { value: '# 一级标题发布文章\n\n正文' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^掘金$/ }))
    fireEvent.click(screen.getByRole('button', { name: '准备掘金草稿' }))

    await waitFor(() =>
      expect(preparePublisher).toHaveBeenCalledWith(
        expect.objectContaining({ title: '一级标题发布文章' })
      )
    )
  })

  test('批量准备会按平台格式提交三个真实草稿任务', async () => {
    // 平台准备探针，用来验证一键分发的顺序和每个平台最终正文格式。
    const preparePublisher = vi.fn(
      async (
        request: RealPublishRequest
      ): Promise<RealPublishPreparationResult> => ({
        status: 'prepared',
        platformId: request.platformId,
        message: `${request.platformId} 已填入`,
        url: 'https://example.com/editor',
      })
    )
    window.visualMuseDesktop = {
      copyText: vi.fn().mockResolvedValue(undefined),
      openPublisher: vi.fn().mockResolvedValue(undefined),
      preparePublisher,
    }
    render(<App />)

    await screen.findByLabelText('Markdown 编辑器')
    // 批量准备按钮，用来触发小红书、掘金和公众号的顺序任务。
    const batchButton = screen.getByRole('button', {
      name: '一键准备 3 个平台草稿',
    })
    fireEvent.click(batchButton)

    expect(batchButton).toHaveClass('ant-btn-loading')
    await waitFor(() => expect(preparePublisher).toHaveBeenCalledTimes(3))
    expect(preparePublisher).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        platformId: 'xiaohongshu',
        markdown: expect.not.stringContaining('# Visual Muse 深色工作台'),
      })
    )
    expect(preparePublisher).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        platformId: 'juejin',
        markdown: expect.stringContaining('# Visual Muse 深色工作台'),
      })
    )
    expect(preparePublisher).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        platformId: 'wechat',
        html: expect.stringContaining('<h1>Visual Muse 深色工作台</h1>'),
      })
    )
    expect(await screen.findByText('已准备 3 个平台草稿')).toBeInTheDocument()
  })

  test('读取持久化配置完成前不会用默认值覆盖旧配置', async () => {
    // 状态读取完成函数，用来控制 Electron 配置加载的完成时机。
    let resolveStoredState:
      | ((state: {
          themeMode: 'light'
          settings: {
            appId: string
            appSecret: string
            serverUrl: string
            apiKey: string
            proxyUrl: string
            defaultTheme: string
          }
        }) => void)
      | undefined
    // 状态读取 Promise，用来模拟桌面端较慢的磁盘读取。
    const storedStatePromise = new Promise<{
      themeMode: 'light'
      settings: {
        appId: string
        appSecret: string
        serverUrl: string
        apiKey: string
        proxyUrl: string
        defaultTheme: string
      }
    }>((resolve) => {
      resolveStoredState = resolve
    })
    // 状态写入探针，用来确认初始化前没有发生覆盖写入。
    const setState = vi.fn().mockResolvedValue(undefined)

    window.visualMuseStore = {
      getState: vi.fn(() => storedStatePromise),
      setState,
    }

    render(<App />)

    expect(setState).not.toHaveBeenCalled()
    resolveStoredState?.({
      themeMode: 'light',
      settings: {
        appId: 'saved-app-id',
        appSecret: '',
        serverUrl: '',
        apiKey: '',
        proxyUrl: '',
        defaultTheme: 'default',
      },
    })

    await waitFor(() =>
      expect(screen.getByTestId('app-shell')).toHaveAttribute(
        'data-theme',
        'light'
      )
    )
    openWechatApiSettings()
    expect(await screen.findByDisplayValue('saved-app-id')).toBeInTheDocument()
    delete window.visualMuseStore
  })
})
