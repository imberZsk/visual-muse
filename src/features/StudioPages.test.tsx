import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { createDefaultStudioState } from '../domain/studio'

describe('文章功能工作台页面', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete window.visualMuseStore
    delete window.visualMuseDesktop
    delete window.visualMuseWorkspace
  })

  test('左侧展示文章列出的主要功能入口', async () => {
    render(<App />)
    await screen.findByLabelText('Markdown 编辑器')
    for (const name of [
      '工作台',
      '文章编辑',
      '图文编辑',
      '主题模板',
      'Skill 模板',
      'AI 助手',
      '自动任务',
      '灵感热榜',
      '账号模型',
      '素材库',
      '发布数据',
      '设置',
      '使用指南',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  test('文章编辑可切换纯编辑和纯预览', async () => {
    render(<App />)
    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(
      screen.getByText('纯预览', { selector: '.ant-segmented-item-label' })
    )
    await waitFor(() =>
      expect(screen.queryByLabelText('Markdown 编辑器')).not.toBeInTheDocument()
    )
    expect(screen.getByLabelText('发布预览')).toBeInTheDocument()
    fireEvent.click(
      screen.getByText('纯编辑', { selector: '.ant-segmented-item-label' })
    )
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeInTheDocument()
    expect(screen.queryByLabelText('发布预览')).not.toBeInTheDocument()
  })

  test('文章工具栏可以插入公式模板', async () => {
    render(<App />)
    // 编辑器，保存插入公式前后的 Markdown 断言目标。
    const editor = await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: '公式' }))
    expect((editor as HTMLTextAreaElement).value).toContain('E = mc^2')
  })

  test('图文编辑支持手动拆卡并展示卡片数', async () => {
    render(<App />)
    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: '图文编辑' }))
    // 图文编辑器，保存手动输入四张卡的文本域。
    const editor = await screen.findByLabelText('图文 Markdown 编辑器')
    fireEvent.change(editor, {
      target: { value: '第一张\n---\n第二张\n---\n第三张\n---\n第四张' },
    })
    expect(await screen.findByText('4 张')).toBeInTheDocument()
    expect(screen.getAllByText(/CARD/)).toHaveLength(4)
  })

  test('主题市场展示文章和图文默认主题', async () => {
    render(<App />)
    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: '主题模板' }))
    expect(await screen.findByText('编辑手记')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '图文主题市场' }))
    expect(await screen.findByText('年度复盘')).toBeInTheDocument()
  })

  test('Skill 模板支持新建个人模板', async () => {
    render(<App />)
    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: 'Skill 模板' }))
    expect(await screen.findByText('去AI味')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建 Skill' }))
    // 名称输入框，保存新建 Skill 表单的第一个文本字段。
    const dialog = screen.getByRole('dialog')
    const inputs = dialog.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: '我的测试 Skill' } })
    // 提示词输入框，保存 SKILL.md 正文。
    const prompt = dialog.querySelector('textarea')
    fireEvent.change(prompt as HTMLTextAreaElement, {
      target: { value: '请按事实写作并输出 Markdown。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(await screen.findByText('我的测试 Skill')).toBeInTheDocument()
  })

  test('非微信平台可通过桌面适配器同步草稿', async () => {
    // 草稿同步探针，保存渲染层提交给主进程的平台与文章内容。
    const syncDraft = vi.fn().mockResolvedValue({
      success: true,
      draftId: 'draft-1',
      message: '已同步草稿',
    })
    window.visualMuseWorkspace = {
      getState: vi.fn().mockResolvedValue({
        accounts: [{ id: 'zhihu-main', platformId: 'zhihu', name: '主账号' }],
      }),
      setState: vi.fn().mockResolvedValue(undefined),
      syncDraft,
    } as unknown as NonNullable<Window['visualMuseWorkspace']>
    render(<App />)
    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: '知乎' }))
    await screen.findByRole('combobox', { name: '发布账号' })
    fireEvent.click(screen.getByRole('button', { name: '同步草稿' }))
    await waitFor(() =>
      expect(syncDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          platformId: 'zhihu',
          title: 'Visual Muse 深色工作台发布说明',
          accountId: 'zhihu-main',
        })
      )
    )
    expect(await screen.findByText('已同步草稿')).toBeInTheDocument()
  })

  test('自动任务仅在模型生成并同步目标平台草稿后标记成功', async () => {
    // 初始工作区，保存自动任务依赖的 Skill、模型、账号与任务配置。
    const workspaceState = createDefaultStudioState('初始正文')
    workspaceState.models = [
      {
        id: 'model-1',
        name: '测试模型',
        baseUrl: 'https://example.com/v1',
        model: 'test',
        apiKey: 'key',
        mode: 'api',
      },
    ]
    workspaceState.accounts = [
      { id: 'zhihu-main', platformId: 'zhihu', name: '主账号' },
    ]
    workspaceState.automations = [
      {
        id: 'automation-1',
        name: '自动生成文章',
        skillId: workspaceState.skills[0].id,
        modelId: 'model-1',
        platformId: 'zhihu',
        lastRunAt: null,
        status: 'idle',
      },
    ]
    // 草稿同步探针，保存自动任务第三步提交的平台、账号与生成内容。
    const syncDraft = vi.fn().mockResolvedValue({
      success: true,
      draftId: 'draft-1',
      message: '已同步草稿',
    })
    window.visualMuseWorkspace = {
      getState: vi.fn().mockResolvedValue(workspaceState),
      setState: vi.fn().mockResolvedValue(undefined),
      generateText: vi.fn().mockResolvedValue({ content: '# 自动生成结果' }),
      syncDraft,
    } as unknown as NonNullable<Window['visualMuseWorkspace']>
    render(<App />)
    await screen.findByLabelText('Markdown 编辑器')
    fireEvent.click(screen.getByRole('button', { name: '自动任务' }))
    fireEvent.click(await screen.findByRole('button', { name: '运行' }))
    await waitFor(() =>
      expect(syncDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          platformId: 'zhihu',
          accountId: 'zhihu-main',
          markdown: '# 自动生成结果',
        })
      )
    )
  })
})
