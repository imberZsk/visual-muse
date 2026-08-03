declare module '*.css'

interface VisualMuseStoreState {
  /** 当前界面主题模式。 */
  themeMode: 'dark' | 'light'
  /** 发布相关配置。 */
  settings: {
    /** 微信公众号 AppID。 */
    appId: string
    /** 微信公众号 AppSecret。 */
    appSecret: string
    /** WenYan Server 地址。 */
    serverUrl: string
    /** WenYan Server API Key。 */
    apiKey: string
    /** 代理地址。 */
    proxyUrl: string
    /** 默认排版主题。 */
    defaultTheme: string
  }
}

interface RealPublishRequest {
  /** 目标平台标识。 */
  platformId: 'xiaohongshu' | 'juejin' | 'wechat'
  /** 文章标题。 */
  title: string
  /** Markdown 正文。 */
  markdown: string
  /** 富文本正文 HTML。 */
  html: string
  /** 平台分类。 */
  category: string
  /** 平台标签。 */
  tags: string[]
  /** 平台摘要。 */
  summary: string
}

interface RealPublishPreparationResult {
  /** 发布窗口当前状态。 */
  status: 'prepared' | 'saved' | 'login-required' | 'not-ready'
  /** 目标平台标识。 */
  platformId: 'xiaohongshu' | 'juejin' | 'wechat'
  /** 面向用户的下一步说明。 */
  message: string
  /** 不包含凭据的官方页面地址。 */
  url: string
}

interface Window {
  /** Electron preload 暴露的剪贴板与平台入口 API。 */
  visualMuseDesktop?: {
    /** 检查应用更新。 */
    checkAppUpdate?: () => Promise<{
      available: boolean
      version?: string
      downloaded?: boolean
    }>
    /** 下载应用更新。 */
    downloadAppUpdate?: () => Promise<{ downloaded: boolean }>
    /** 安装已下载应用更新。 */
    installAppUpdate?: () => Promise<boolean>
    /** 复制文本到系统剪贴板；`text` 是待复制内容。 */
    copyText: (text: string) => Promise<void>
    /** 打开平台创作入口；`platformId` 是平台标识。 */
    openPublisher: (platformId: string) => Promise<void>
    /** 打开持久平台会话并填充文章；`request` 是经过预检的文章数据。 */
    preparePublisher?: (
      request: RealPublishRequest
    ) => Promise<RealPublishPreparationResult>
  }
  /** Electron preload 暴露的本地状态存储 API。 */
  visualMuseStore?: {
    /** 读取本地状态；无参数，返回主题和发布配置。 */
    getState: () => Promise<VisualMuseStoreState | null>
    /** 写入本地状态；`state` 是需要保存的主题和发布配置。 */
    setState: (state: VisualMuseStoreState) => Promise<void>
  }
  /** Electron preload 暴露的运行时信息。 */
  visualMuseRuntime?: {
    /** 当前操作系统平台。 */
    platform: string
  }
}
