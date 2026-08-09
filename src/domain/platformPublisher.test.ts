import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  PlatformPublisher,
  buildPlatformFillScript,
  validateRealPublishRequest,
  type PublisherWindow,
  type RealPublishRequest,
} from '../../electron/platformPublisher.js'

/** 测试文章请求，用于覆盖三个平台的输入校验和页面填充。 */
const testRequest: RealPublishRequest = {
  platformId: 'juejin',
  title: '三平台发布验收',
  markdown: '# 三平台发布验收\n\n正文',
  html: '<h1>三平台发布验收</h1><p>正文</p>',
  category: '前端',
  tags: ['Electron', '效率工具'],
  summary: '真实发布功能验收',
}

/** 在当前 jsdom 页面执行平台填充脚本；`request` 是目标平台文章数据。 */
function executeFillScript(request: RealPublishRequest): {
  status: string
  message: string
} {
  return window.eval(buildPlatformFillScript(request)) as {
    status: string
    message: string
  }
}

/** 安装富文本编辑命令替身；`editor` 是接收正文的 contenteditable 元素。 */
function installExecCommandMock(editor: HTMLElement): void {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn((command: string, _showUi: boolean, value: string) => {
      if (command === 'insertHTML') editor.innerHTML = value
      if (command === 'insertText') editor.textContent = value
      return true
    }),
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
})

describe('真实平台发布请求', () => {
  test('拒绝未知平台与空正文', () => {
    expect(() =>
      validateRealPublishRequest({ ...testRequest, platformId: 'unknown' })
    ).toThrow('不支持的真实发布平台')
    expect(() =>
      validateRealPublishRequest({ ...testRequest, markdown: ' ' })
    ).toThrow('Markdown 正文为空或过长')
  })

  test('清理分类标签摘要并限制标签数量', () => {
    // 标签输入，保存包含空值、非字符串和超量数据的渲染进程请求。
    const tags = [
      ' Electron ',
      '',
      1,
      ...Array.from({ length: 12 }, (_, index) => `tag-${index}`),
    ]
    // 校验结果，保存经过主进程边界清理的安全请求。
    const result = validateRealPublishRequest({
      ...testRequest,
      category: ' 前端 ',
      summary: ' 摘要 ',
      tags,
    })

    expect(result.category).toBe('前端')
    expect(result.summary).toBe('摘要')
    expect(result.tags).toHaveLength(10)
    expect(result.tags[0]).toBe('Electron')
  })
})

describe('三平台页面填充脚本', () => {
  test('掘金标题与 Markdown 通过真实 input 事件写入', () => {
    document.body.innerHTML =
      '<input placeholder="输入文章标题..."><div class="CodeMirror"><textarea></textarea></div>'
    // 正文输入事件探针，用来确认不是只改 DOM 表面值。
    const inputListener = vi.fn()
    // Markdown 输入框，用来接收平台脚本写入的原始正文。
    const editor = document.querySelector('textarea')
    editor?.addEventListener('input', inputListener)

    expect(executeFillScript(testRequest)).toMatchObject({ status: 'filled' })
    expect(document.querySelector('input')).toHaveValue(testRequest.title)
    expect(editor).toHaveValue(testRequest.markdown)
    expect(inputListener).toHaveBeenCalledOnce()
  })

  test('掘金优先更新 CodeMirror 文档模型并回读正文', () => {
    window.history.replaceState({}, '', '/editor/drafts/acceptance-1')
    document.body.innerHTML =
      '<input placeholder="输入文章标题..."><span>保存成功</span><div class="CodeMirror"><textarea></textarea></div>'
    // 编辑器正文，保存 CodeMirror 文档模型中的当前 Markdown。
    let editorValue = ''
    // CodeMirror 写入探针，用于确认真实编辑器不会只修改隐藏 textarea。
    const setValue = vi.fn((value: string) => {
      editorValue = value
    })
    // CodeMirror 容器，保存掘金页面挂载的编辑器实例。
    const codeMirrorHost = document.querySelector<HTMLElement>('.CodeMirror')
    expect(codeMirrorHost).not.toBeNull()
    Object.assign(codeMirrorHost as HTMLElement, {
      CodeMirror: {
        setValue,
        getValue: () => editorValue,
        focus: vi.fn(),
      },
    })

    expect(executeFillScript(testRequest)).toMatchObject({ status: 'saved' })
    expect(setValue).toHaveBeenCalledWith(testRequest.markdown)
    expect(editorValue).toBe(testRequest.markdown)
    expect(document.querySelector('textarea')).toHaveValue('')
  })

  test('小红书长文标题与正文写入富文本编辑器', () => {
    document.body.innerHTML =
      '<input placeholder="输入标题"><div contenteditable="true" role="textbox"></div>'
    // 小红书富文本编辑器，用来接收纯文本正文。
    const editor = document.querySelector<HTMLElement>('[contenteditable]')
    expect(editor).not.toBeNull()
    installExecCommandMock(editor as HTMLElement)

    expect(
      executeFillScript({ ...testRequest, platformId: 'xiaohongshu' })
    ).toMatchObject({ status: 'filled' })
    expect(document.querySelector('input')).toHaveValue(testRequest.title)
    expect(editor?.textContent).toBe(testRequest.markdown)
  })

  test('小红书长文首页优先进入新的创作', () => {
    document.body.innerHTML = '<button>写长文</button><button>新的创作</button>'
    // 可见区域替身，用来让 jsdom 中的按钮满足页面脚本的可见性判断。
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      {},
    ] as unknown as DOMRectList)
    // 写长文入口探针，用来确认长文首页不会重复点击顶部标签。
    const longArticleClick = vi.fn()
    // 新建入口探针，用来确认脚本进入实际编辑器前的中间页面。
    const newArticleClick = vi.fn()
    // 写长文入口元素，保存顶部平台标签按钮。
    const longArticleButton = document.querySelectorAll('button')[0]
    // 新建入口元素，保存长文首页的实际创作按钮。
    const newArticleButton = document.querySelectorAll('button')[1]
    longArticleButton?.addEventListener('click', longArticleClick)
    newArticleButton?.addEventListener('click', newArticleClick)

    expect(
      executeFillScript({ ...testRequest, platformId: 'xiaohongshu' })
    ).toEqual({ status: 'navigating', message: '正在新建小红书长文' })
    expect(newArticleClick).toHaveBeenCalledOnce()
    expect(longArticleClick).not.toHaveBeenCalled()
  })

  test('小红书短信登录页返回明确登录提示', () => {
    document.body.innerHTML = '<input placeholder="手机号">'

    expect(
      executeFillScript({ ...testRequest, platformId: 'xiaohongshu' })
    ).toEqual({ status: 'login-required', message: '小红书登录态失效' })
  })

  test('公众号标题与 HTML 写入富文本编辑器', () => {
    document.body.innerHTML =
      '<textarea placeholder="请在这里输入标题"></textarea><div contenteditable="true" role="textbox"></div>'
    // 公众号富文本编辑器，用来接收渲染后的文章 HTML。
    const editor = document.querySelector<HTMLElement>('[contenteditable]')
    expect(editor).not.toBeNull()
    installExecCommandMock(editor as HTMLElement)

    expect(
      executeFillScript({ ...testRequest, platformId: 'wechat' })
    ).toMatchObject({ status: 'filled' })
    expect(document.querySelector('textarea')).toHaveValue(testRequest.title)
    expect(editor?.innerHTML).toBe(testRequest.html)
  })

  test('公众号正文不会写入文档顺序更靠前的标题 ProseMirror', () => {
    document.body.innerHTML =
      '<textarea placeholder="请在这里输入标题"></textarea><div class="title-editor-overlay"><div class="ProseMirror" contenteditable="true"></div></div><div id="ueditor_0"><div class="ProseMirror" contenteditable="true">从这里开始写正文</div></div><textarea placeholder="摘要会在转发卡片展示"></textarea>'
    // 标题富文本层，保存公众号页面中先于正文出现的同名 ProseMirror。
    const titleEditor = document.querySelector<HTMLElement>(
      '.title-editor-overlay .ProseMirror'
    )
    // 正文编辑器，保存必须接收文章 HTML 的 ueditor 区域。
    const bodyEditor = document.querySelector<HTMLElement>(
      '#ueditor_0 .ProseMirror'
    )
    expect(titleEditor).not.toBeNull()
    expect(bodyEditor).not.toBeNull()
    installExecCommandMock(bodyEditor as HTMLElement)

    expect(
      executeFillScript({ ...testRequest, platformId: 'wechat' })
    ).toMatchObject({ status: 'filled' })
    expect(document.querySelector('textarea')).toHaveValue(testRequest.title)
    expect(document.querySelector('textarea[placeholder*="摘要"]')).toHaveValue(
      testRequest.summary
    )
    expect(titleEditor).toHaveTextContent('')
    expect(bodyEditor?.innerHTML).toBe(testRequest.html)
  })
})

describe('平台发布窗口管理', () => {
  test('复用平台窗口并阻止非官方弹出页', async () => {
    // 页面脚本探针，模拟官方编辑器已经完成草稿保存。
    const executeJavaScript = vi.fn().mockResolvedValue({
      status: 'saved',
      message: '已保存',
    })
    // 窗口加载探针，用来验证入口与弹出页白名单。
    const loadURL = vi.fn().mockResolvedValue(undefined)
    // 弹出页处理器，保存管理器注册的官方来源校验逻辑。
    let popupHandler:
      ((details: { url: string }) => { action: 'deny' }) | undefined
    // 关闭事件处理器，保存窗口生命周期清理回调。
    let closeHandler: (() => void) | undefined
    // 模拟窗口，提供管理器需要的最小 Electron 接口。
    const publisherWindow: PublisherWindow = {
      webContents: {
        executeJavaScript,
        getURL: () => 'https://juejin.cn/editor/drafts/1?from=test',
        setWindowOpenHandler: (handler) => {
          popupHandler = handler
        },
      },
      loadURL,
      show: vi.fn(),
      focus: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false),
      on: (_eventName, listener) => {
        closeHandler = listener
      },
    }
    // 窗口工厂探针，用来确认同一平台不会重复创建会话窗口。
    const createWindow = vi.fn(() => publisherWindow)
    // 发布管理器，使用固定测试地址避免访问真实平台。
    const publisher = new PlatformPublisher(createWindow, {
      xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
      juejin: 'https://juejin.cn/editor/drafts/new?v=2',
      wechat: 'https://mp.weixin.qq.com/',
    })

    await expect(publisher.prepare(testRequest)).resolves.toMatchObject({
      status: 'saved',
      platformId: 'juejin',
      url: 'https://juejin.cn/editor/drafts/1',
    })
    await publisher.prepare(testRequest)
    expect(createWindow).toHaveBeenCalledOnce()

    popupHandler?.({ url: 'https://evil.example/publish' })
    expect(loadURL).toHaveBeenCalledTimes(2)
    popupHandler?.({ url: 'https://juejin.cn/editor/drafts/1' })
    expect(loadURL).toHaveBeenLastCalledWith(
      'https://juejin.cn/editor/drafts/1'
    )

    closeHandler?.()
    await publisher.prepare(testRequest)
    expect(createWindow).toHaveBeenCalledTimes(2)
  })

  test('无头验收模式填入内容但不显示或聚焦平台窗口', async () => {
    // 显示窗口探针，用来确认隐藏模式不会抢占用户桌面焦点。
    const show = vi.fn()
    // 聚焦窗口探针，用来确认隐藏模式不会切换当前活动应用。
    const focus = vi.fn()
    // 模拟窗口，保存无头模式仍需执行脚本的最小 Electron 接口。
    const publisherWindow: PublisherWindow = {
      webContents: {
        executeJavaScript: vi.fn().mockResolvedValue({
          status: 'saved',
          message: '已保存',
        }),
        getURL: () => 'https://juejin.cn/editor/drafts/2',
        setWindowOpenHandler: vi.fn(),
      },
      // 登录页重定向中止探针，用于确认 ERR_ABORTED 不会覆盖后续页面状态。
      loadURL: vi.fn().mockRejectedValue(new Error('ERR_ABORTED (-3)')),
      show,
      focus,
      isDestroyed: vi.fn().mockReturnValue(false),
      on: vi.fn(),
    }
    // 隐藏发布管理器，保存与 E2E 主进程相同的不显示窗口配置。
    const publisher = new PlatformPublisher(
      () => publisherWindow,
      {
        xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
        juejin: 'https://juejin.cn/editor/drafts/new?v=2',
        wechat: 'https://mp.weixin.qq.com/',
      },
      false
    )

    await expect(publisher.prepare(testRequest)).resolves.toMatchObject({
      status: 'saved',
    })
    expect(show).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })
})
