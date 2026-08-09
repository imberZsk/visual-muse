/** 支持真实网页发布准备的首批平台标识。 */
export type RealPublishPlatformId = 'xiaohongshu' | 'juejin' | 'wechat'

/** 渲染进程提交给平台发布窗口的文章数据。 */
export interface RealPublishRequest {
  /** 目标平台标识。 */
  platformId: RealPublishPlatformId
  /** 文章标题。 */
  title: string
  /** 保留 Markdown 结构的正文。 */
  markdown: string
  /** 供富文本平台使用的正文 HTML。 */
  html: string
  /** 平台文章分类。 */
  category: string
  /** 平台文章标签。 */
  tags: string[]
  /** 平台文章摘要。 */
  summary: string
}

/** 平台发布窗口准备结果。 */
export interface RealPublishPreparationResult {
  /** 发布窗口当前状态。 */
  status: 'prepared' | 'saved' | 'login-required' | 'not-ready'
  /** 目标平台标识。 */
  platformId: RealPublishPlatformId
  /** 面向用户的下一步说明。 */
  message: string
  /** 当前平台页面地址，不包含任何 Cookie。 */
  url: string
}

/** 页面脚本返回的自动填充状态。 */
interface PageFillResult {
  /** 页面当前处理状态。 */
  status: 'filled' | 'saved' | 'login-required' | 'navigating' | 'not-ready'
  /** 页面状态说明。 */
  message: string
}

/** 发布窗口所需的最小 webContents 接口，便于在测试中注入替身。 */
export interface PublisherWebContents {
  /** 在平台页面执行受控的自动填充脚本。 */
  executeJavaScript: (script: string) => Promise<unknown>
  /** 读取当前官方页面地址，用于返回不含凭据的草稿 URL。 */
  getURL: () => string
  /** 拦截平台打开的新编辑页并继续使用同一持久会话窗口。 */
  setWindowOpenHandler: (
    handler: (details: { url: string }) => { action: 'deny' }
  ) => void
}

/** 发布窗口所需的最小接口，避免领域编排依赖完整 Electron 类型。 */
export interface PublisherWindow {
  /** 平台页面对应的 webContents。 */
  webContents: PublisherWebContents
  /** 加载经过白名单校验的平台入口。 */
  loadURL: (url: string) => Promise<unknown>
  /** 显示平台发布窗口。 */
  show: () => void
  /** 将平台发布窗口置于前台。 */
  focus: () => void
  /** 判断窗口是否已经销毁。 */
  isDestroyed: () => boolean
  /** 监听窗口生命周期事件。 */
  on: (eventName: 'closed', listener: () => void) => void
}

/** 创建平台发布窗口时使用的参数。 */
export interface PublisherWindowOptions {
  /** 目标平台标识，用于设置窗口标题和持久分区。 */
  platformId: RealPublishPlatformId
}

/** 平台发布窗口创建函数。 */
export type PublisherWindowFactory = (
  options: PublisherWindowOptions
) => PublisherWindow

/** 平台官方创作入口，只允许主进程访问这些固定 HTTPS 地址。 */
export const realPublisherUrlMap: Record<RealPublishPlatformId, string> = {
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
  juejin: 'https://juejin.cn/editor/drafts/new?v=2',
  wechat: 'https://mp.weixin.qq.com/',
}

/** 平台允许留在持久窗口中的官方 HTTPS 来源。 */
const realPublisherOriginMap: Record<RealPublishPlatformId, string[]> = {
  xiaohongshu: ['https://creator.xiaohongshu.com'],
  juejin: ['https://juejin.cn'],
  wechat: ['https://mp.weixin.qq.com'],
}

/** 单次页面填充最多等待的轮询次数。 */
const pageFillMaximumAttempts = 60
/** 两次页面填充检查之间的等待毫秒数。 */
const pageFillRetryIntervalMs = 500
/** 文章标题允许的最大字符数，防止异常 IPC 数据占用页面资源。 */
const maximumTitleLength = 200
/** 文章正文允许的最大字符数，覆盖长文同时限制异常 IPC 数据。 */
const maximumBodyLength = 500_000

/** 页面填充完成后的平台提示文案。 */
const preparedMessageMap: Record<RealPublishPlatformId, string> = {
  xiaohongshu: '草稿内容已填入小红书长文编辑器，请检查配图后保存',
  juejin: '草稿内容已填入掘金编辑器，请补齐分类和标签后保存',
  wechat: '草稿内容已填入公众号编辑器，请检查封面后保存',
}

/** 平台确认服务端草稿已保存后的提示文案。 */
const savedMessageMap: Partial<Record<RealPublishPlatformId, string>> = {
  juejin: '掘金草稿已自动保存，可在官方草稿箱继续编辑',
}

/** 登录态失效时的统一提示文案。 */
const loginRequiredMessageMap: Record<RealPublishPlatformId, string> = {
  xiaohongshu: '小红书创作会话已失效，请在打开的窗口完成登录后重试',
  juejin: '掘金创作会话已失效，请在打开的窗口完成登录后重试',
  wechat: '公众号会话已失效，请在打开的窗口完成登录后重试',
}

/** 等待指定时间；`milliseconds` 是等待毫秒数。 */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

/** 判断未知值是否为页面脚本约定的返回对象；`value` 是脚本执行结果。 */
function isPageFillResult(value: unknown): value is PageFillResult {
  if (!value || typeof value !== 'object') return false
  // 页面脚本结果，保存待校验的状态与说明字段。
  const pageResult = value as Record<string, unknown>
  return (
    typeof pageResult.status === 'string' &&
    typeof pageResult.message === 'string'
  )
}

/** 校验真实发布请求；`request` 是来自不可信渲染进程的输入。 */
export function validateRealPublishRequest(
  request: unknown
): RealPublishRequest {
  if (!request || typeof request !== 'object') {
    throw new Error('发布请求格式无效')
  }
  // 待校验请求，保存渲染进程传入的未知字段。
  const candidate = request as Record<string, unknown>
  // 平台标识，保存请求选中的真实发布目标。
  const platformId = candidate.platformId
  // 标题文本，保存经过长度校验的文章标题。
  const title = candidate.title
  // Markdown 正文，保存经过长度校验的原始文章内容。
  const markdown = candidate.markdown
  // HTML 正文，保存经过长度校验的富文本文章内容。
  const html = candidate.html

  if (
    platformId !== 'xiaohongshu' &&
    platformId !== 'juejin' &&
    platformId !== 'wechat'
  ) {
    throw new Error('不支持的真实发布平台')
  }
  if (
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    title.length > maximumTitleLength
  ) {
    throw new Error('文章标题为空或过长')
  }
  if (
    typeof markdown !== 'string' ||
    markdown.trim().length === 0 ||
    markdown.length > maximumBodyLength
  ) {
    throw new Error('Markdown 正文为空或过长')
  }
  if (typeof html !== 'string' || html.length > maximumBodyLength) {
    throw new Error('HTML 正文格式无效或过长')
  }

  // 分类文本，保存可选的平台内容分类。
  const category =
    typeof candidate.category === 'string' ? candidate.category.trim() : ''
  // 标签列表，保存过滤空值后的平台标签。
  const tags = Array.isArray(candidate.tags)
    ? candidate.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 10)
    : []
  // 摘要文本，保存可选的平台文章摘要。
  const summary =
    typeof candidate.summary === 'string' ? candidate.summary.trim() : ''

  return {
    platformId,
    title: title.trim(),
    markdown,
    html,
    category,
    tags,
    summary,
  }
}

/** 构建平台页面填充脚本；`request` 是已经通过主进程校验的文章数据。 */
export function buildPlatformFillScript(request: RealPublishRequest): string {
  // 安全序列化后的请求，避免文章内容提前结束注入脚本。
  const serializedRequest = JSON.stringify(request).replaceAll('<', '\\u003c')

  return `(() => {
    /** 已校验的文章请求，只在当前官方平台页面内使用。 */
    const request = ${serializedRequest};
    /** 当前页面地址，用于判断登录页和创作页。 */
    const currentUrl = window.location.href;

    /** 使用原生 setter 写入 React/Vue 受控输入框；参数分别为元素和值。 */
    const setNativeValue = (element, value) => {
      /** 输入控件原型，用于取得不会被页面框架覆盖的 value setter。 */
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      /** 浏览器原生 value setter，用于同步页面框架内部状态。 */
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!valueSetter) return false;
      valueSetter.call(element, value);
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        data: value,
        inputType: 'insertText'
      }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    /** 向富文本区域写入纯文本或 HTML；参数分别为元素、内容和是否为 HTML。 */
    const fillEditable = (element, content, isHtml) => {
      element.focus();
      /** 当前编辑器选择区，用于全选并替换已有内容。 */
      const selection = window.getSelection();
      /** 覆盖整个编辑器内容的选择范围。 */
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      /** 浏览器编辑命令结果，用于确认页面接收了真实输入事件。 */
      const inserted = document.execCommand(
        isHtml ? 'insertHTML' : 'insertText',
        false,
        content
      );
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        data: content,
        inputType: isHtml ? 'insertFromPaste' : 'insertText'
      }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return inserted || element.textContent?.trim().length > 0;
    };

    /** 按可见文本查找可点击元素；text 是按钮或标签的完整文案。 */
    const findClickableByText = (text) => {
      /** 页面内可能承载操作文本的元素列表。 */
      const candidates = Array.from(document.querySelectorAll(
        'button, a, [role="button"], [role="tab"], div, span'
      ));
      return candidates.find((element) =>
        element.textContent?.trim() === text &&
        element.getClientRects().length > 0
      ) || null;
    };

    if (request.platformId === 'juejin') {
      if (currentUrl.includes('/login')) {
        return { status: 'login-required', message: '掘金登录态失效' };
      }
      /** 掘金标题输入框。 */
      const titleInput = document.querySelector('input[placeholder*="文章标题"]');
      /** 掘金 CodeMirror 容器，用于取得编辑器文档实例。 */
      const codeMirrorHost = document.querySelector('.CodeMirror');
      /** 掘金 CodeMirror 实例，用于更新真实文档模型而非仅修改隐藏输入框。 */
      const codeMirrorEditor = codeMirrorHost?.CodeMirror;
      /** 掘金 CodeMirror 用于接收真实输入事件的 textarea。 */
      const markdownEditor = codeMirrorHost?.querySelector('textarea') || document.querySelector('textarea');
      if (
        !(titleInput instanceof HTMLInputElement) ||
        (!codeMirrorEditor && !(markdownEditor instanceof HTMLTextAreaElement))
      ) {
        return { status: 'not-ready', message: '等待掘金编辑器加载' };
      }
      /** 标题写入结果，用于阻止半填充状态。 */
      const titleFilled = setNativeValue(titleInput, request.title);
      /** Markdown 写入结果，用于确认 CodeMirror 文档模型已接收完整正文。 */
      let bodyFilled = false;
      // Bug 修复：只修改隐藏 textarea 会让页面显示 0 字且自动保存空正文，必须更新 CodeMirror 文档模型。
      if (codeMirrorEditor && typeof codeMirrorEditor.setValue === 'function') {
        /** CodeMirror 当前正文，用于避免轮询时反复写入并打断平台自动保存。 */
        const currentMarkdown = typeof codeMirrorEditor.getValue === 'function'
          ? codeMirrorEditor.getValue()
          : '';
        if (currentMarkdown !== request.markdown) {
          codeMirrorEditor.setValue(request.markdown);
        }
        codeMirrorEditor.focus?.();
        bodyFilled = typeof codeMirrorEditor.getValue === 'function'
          ? codeMirrorEditor.getValue() === request.markdown
          : true;
      } else if (markdownEditor instanceof HTMLTextAreaElement) {
        bodyFilled = setNativeValue(markdownEditor, request.markdown);
        markdownEditor.focus();
      }
      if (!titleFilled || !bodyFilled) {
        return { status: 'not-ready', message: '掘金编辑器尚未接收文章内容' };
      }
      /** 掘金草稿路径前缀，用于从当前地址提取服务端草稿 ID。 */
      const draftPathPrefix = '/editor/drafts/';
      /** 掘金草稿 ID，用于排除尚未创建服务端草稿的 new 路径。 */
      const draftId = window.location.pathname.startsWith(draftPathPrefix)
        ? window.location.pathname.slice(draftPathPrefix.length)
        : '';
      /** 掘金正式草稿地址判断结果。 */
      const hasDraftUrl = Boolean(draftId && draftId !== 'new');
      /** 页面可读文本，用于兼容浏览器与无布局测试环境的保存提示读取。 */
      const pageText = document.body.innerText || document.body.textContent || '';
      /** 掘金自动保存提示，用于确认正文已完成服务端保存。 */
      const hasSavedIndicator = pageText.includes('保存成功');
      return hasDraftUrl && hasSavedIndicator
        ? { status: 'saved', message: '掘金草稿已保存' }
        : { status: 'filled', message: '掘金文章已填充，等待自动保存' };
    }

    if (request.platformId === 'xiaohongshu') {
      if (currentUrl.includes('/login') || document.querySelector('input[placeholder="手机号"]')) {
        return { status: 'login-required', message: '小红书登录态失效' };
      }
      /** 小红书长文标题输入框。 */
      const titleInput = document.querySelector(
        'input[placeholder*="标题"], textarea[placeholder*="标题"]'
      );
      /** 小红书长文富文本编辑区域。 */
      const articleEditor = document.querySelector(
        '[contenteditable="true"][role="textbox"], .ProseMirror[contenteditable="true"], [contenteditable="true"]'
      );
      if (!titleInput || !articleEditor) {
        /** 小红书长文首页的“新的创作”入口。 */
        const newArticleEntry = findClickableByText('新的创作');
        // 业务场景：点击“写长文”后会先到长文首页，必须继续进入新的创作才能出现编辑器。
        if (newArticleEntry instanceof HTMLElement) {
          newArticleEntry.click();
          return { status: 'navigating', message: '正在新建小红书长文' };
        }
        /** 小红书发布首页的“写长文”入口。 */
        const longArticleEntry = findClickableByText('写长文');
        if (longArticleEntry instanceof HTMLElement) {
          longArticleEntry.click();
          return { status: 'navigating', message: '正在打开小红书长文编辑器' };
        }
        return { status: 'not-ready', message: '等待小红书长文编辑器加载' };
      }
      /** 小红书标题写入结果。 */
      const titleFilled = setNativeValue(titleInput, request.title);
      /** 小红书正文写入结果。 */
      const bodyFilled = fillEditable(articleEditor, request.markdown, false);
      if (!titleFilled || !bodyFilled) {
        return { status: 'not-ready', message: '小红书编辑器尚未接收文章内容' };
      }
      return { status: 'filled', message: '小红书长文已填充' };
    }

    if (currentUrl.includes('/cgi-bin/loginpage') || document.querySelector('input[name="account"]')) {
      return { status: 'login-required', message: '公众号登录态失效' };
    }
    /** 公众号文章标题输入框。 */
    const titleInput = document.querySelector(
      'textarea[placeholder*="标题"], input[placeholder*="标题"]'
    );
    /** 公众号富文本编辑区域。 */
    const articleEditor = document.querySelector(
      '#ueditor_0 .ProseMirror[contenteditable="true"], #ueditor_0 [contenteditable="true"]'
    ) || document.querySelector('[contenteditable="true"][role="textbox"]');
    if (!titleInput || !articleEditor) {
      /** 公众号首页的新建文章入口。 */
      const articleEntry = findClickableByText('文章');
      if (articleEntry instanceof HTMLElement) {
        articleEntry.click();
        return { status: 'navigating', message: '正在打开公众号文章编辑器' };
      }
      return { status: 'not-ready', message: '等待公众号文章编辑器加载' };
    }
    /** 公众号标题写入结果。 */
    const titleFilled = setNativeValue(titleInput, request.title);
    /** 公众号 HTML 写入结果，空 HTML 时回退到 Markdown 正文。 */
    const bodyFilled = fillEditable(
      articleEditor,
      request.html.trim() || request.markdown,
      request.html.trim().length > 0
    );
    /** 公众号正文探针容器，用于从提交 HTML 中提取可回读的开头文本。 */
    const bodyProbeContainer = document.createElement('div');
    bodyProbeContainer.innerHTML = request.html.trim() || request.markdown;
    /** 公众号正文探针，用于确认内容进入正文编辑器而不是标题 ProseMirror。 */
    const bodyProbe = (bodyProbeContainer.textContent || '')
      .replace(/\\s+/g, ' ')
      .trim()
      .slice(0, 80);
    /** 公众号正文文本，用于回读富文本编辑器的实际内容。 */
    const articleText = (articleEditor.textContent || '')
      .replace(/\\s+/g, ' ')
      .trim();
    /** 公众号标题回读结果，用于阻止正文误写到标题后仍返回成功。 */
    const titleMatches = titleInput.value.trim() === request.title;
    /** 公众号正文回读结果，用于确认正文开头已经进入指定编辑器。 */
    const bodyMatches = bodyProbe.length > 0 && articleText.includes(bodyProbe);
    /** 公众号摘要输入框，用于自动填入分发计划生成的摘要。 */
    const summaryInput = document.querySelector('textarea[placeholder*="摘要"]');
    if (request.summary && summaryInput instanceof HTMLTextAreaElement) {
      setNativeValue(summaryInput, request.summary);
    }
    if (!titleFilled || !bodyFilled || !titleMatches || !bodyMatches) {
      return { status: 'not-ready', message: '公众号编辑器尚未接收文章内容' };
    }
    return { status: 'filled', message: '公众号文章已填充' };
  })()`
}

/** 管理三平台持久会话窗口，并把文章可靠填入官方编辑器。 */
export class PlatformPublisher {
  /** 窗口创建函数，保存 Electron 主进程注入的窗口工厂。 */
  private readonly createWindow: PublisherWindowFactory
  /** 平台入口表，测试环境可注入本地页面。 */
  private readonly publisherUrls: Record<RealPublishPlatformId, string>
  /** 是否显示平台窗口，E2E 使用隐藏窗口避免抢占用户焦点。 */
  private readonly revealWindow: boolean
  /** 已创建窗口表，保证每个平台复用自己的登录会话页面。 */
  private readonly windows = new Map<RealPublishPlatformId, PublisherWindow>()

  /** 创建平台发布管理器；参数分别为窗口工厂、可选入口表和是否显示窗口。 */
  constructor(
    createWindow: PublisherWindowFactory,
    publisherUrls: Record<RealPublishPlatformId, string> = realPublisherUrlMap,
    revealWindow = true
  ) {
    this.createWindow = createWindow
    this.publisherUrls = publisherUrls
    this.revealWindow = revealWindow
  }

  /** 打开平台并填充文章；`input` 是来自渲染进程的未知请求。 */
  async prepare(input: unknown): Promise<RealPublishPreparationResult> {
    // 发布请求，保存主进程校验后的平台与文章数据。
    const request = validateRealPublishRequest(input)
    // 平台入口地址，保存固定白名单或测试注入地址。
    const publisherUrl = this.publisherUrls[request.platformId]
    // 发布窗口，保存当前平台复用或新建的窗口实例。
    const publisherWindow = this.getOrCreateWindow(request.platformId)

    try {
      await publisherWindow.loadURL(publisherUrl)
    } catch (error) {
      // Bug 修复：平台跳转登录页时旧导航会报 ERR_ABORTED，但新页面仍正常加载，不能误报为发布失败。
      const navigationErrorMessage =
        error instanceof Error ? error.message : String(error)
      if (!navigationErrorMessage.includes('ERR_ABORTED')) throw error
    }
    // 业务场景：自动化验收必须保持隐藏，其余环境显示窗口供用户登录和最终确认。
    if (this.revealWindow) {
      publisherWindow.show()
      publisherWindow.focus()
    }

    // 页面脚本，保存只包含校验后文章数据的自动填充逻辑。
    const fillScript = buildPlatformFillScript(request)
    for (let attempt = 0; attempt < pageFillMaximumAttempts; attempt += 1) {
      // 页面执行结果，保存本次轮询得到的填充或登录状态。
      const scriptResult = await publisherWindow.webContents
        .executeJavaScript(fillScript)
        .catch(() => null)

      if (isPageFillResult(scriptResult)) {
        if (scriptResult.status === 'saved') {
          // 当前页面地址，保存平台自动保存后生成的正式草稿 URL。
          const currentUrl = publisherWindow.webContents.getURL()
          // 草稿地址，保存移除查询参数和片段后的官方 URL，避免向渲染进程暴露会话信息。
          const draftUrl = new URL(currentUrl)
          return {
            status: 'saved',
            platformId: request.platformId,
            message:
              savedMessageMap[request.platformId] ??
              preparedMessageMap[request.platformId],
            url: `${draftUrl.origin}${draftUrl.pathname}`,
          }
        }
        if (scriptResult.status === 'filled') {
          // 业务场景：真实掘金会自动保存，必须继续轮询；本地测试编辑器没有服务端草稿阶段。
          if (
            request.platformId === 'juejin' &&
            publisherUrl === realPublisherUrlMap.juejin
          ) {
            await delay(pageFillRetryIntervalMs)
            continue
          }
          return {
            status: 'prepared',
            platformId: request.platformId,
            message: preparedMessageMap[request.platformId],
            url: publisherUrl,
          }
        }
        if (scriptResult.status === 'login-required') {
          return {
            status: 'login-required',
            platformId: request.platformId,
            message: loginRequiredMessageMap[request.platformId],
            url: publisherUrl,
          }
        }
      }

      await delay(pageFillRetryIntervalMs)
    }

    return {
      status: 'not-ready',
      platformId: request.platformId,
      message: '平台编辑器加载超时，请检查网络后重试',
      url: publisherUrl,
    }
  }

  /** 取得可复用窗口；`platformId` 是目标平台标识。 */
  private getOrCreateWindow(
    platformId: RealPublishPlatformId
  ): PublisherWindow {
    // 现有窗口，保存平台上一次打开且尚未销毁的会话窗口。
    const existingWindow = this.windows.get(platformId)
    if (existingWindow && !existingWindow.isDestroyed()) return existingWindow

    // 新平台窗口，保存带持久会话分区的 Electron 窗口。
    const publisherWindow = this.createWindow({ platformId })
    publisherWindow.webContents.setWindowOpenHandler(({ url }) => {
      // 业务场景：公众号编辑器可能打开新页；在同一窗口加载才能继续复用登录态并执行填充。
      if (
        URL.canParse(url) &&
        realPublisherOriginMap[platformId].includes(new URL(url).origin)
      ) {
        void publisherWindow.loadURL(url)
      }
      return { action: 'deny' }
    })
    publisherWindow.on('closed', () => {
      this.windows.delete(platformId)
    })
    this.windows.set(platformId, publisherWindow)
    return publisherWindow
  }
}
