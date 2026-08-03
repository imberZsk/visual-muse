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
  /** Electron preload 暴露的功能工作区与外部能力 API。 */
  visualMuseWorkspace?: {
    /** 读取功能工作区。 */
    getState: () => Promise<import('../domain/studio').StudioState | null>
    /** 写入功能工作区；`state` 是完整可序列化状态。 */
    setState: (state: import('../domain/studio').StudioState) => Promise<void>
    /** 导出图文卡片；`cards` 是 Markdown 数组，`theme` 是配色对象。 */
    exportCards: (
      cards: string[],
      theme: import('../domain/studio').StudioTheme | undefined
    ) => Promise<{ count: number; directory: string }>
    /** 调用 OpenAI 兼容写作模型。 */
    generateText: (request: {
      model: import('../domain/studio').StudioModel
      systemPrompt: string
      userPrompt: string
    }) => Promise<{ content: string }>
    /** 刷新白名单热榜来源。 */
    fetchTrends: (
      sourceId: string
    ) => Promise<Array<{ title: string; url: string; hot: string }>>
    /** 打开平台独立持久登录窗口。 */
    openAccountLogin: (
      platformId: string,
      accountId?: string
    ) => Promise<boolean>
    /** 打开平台官方 API 凭据设置页。 */
    openAccountSettings: (
      platformId: string,
      accountId?: string
    ) => Promise<boolean>
    /** 检查平台站点会话并返回可读状态。 */
    checkAccount: (
      platformId: string,
      accountId?: string
    ) => Promise<{ authenticated: boolean; message: string }>
    /** 清除指定平台账号槽位的登录数据。 */
    logoutAccount: (platformId: string, accountId?: string) => Promise<boolean>
    /** 选择图片素材文件。 */
    importAssets: () => Promise<string[]>
    /** 将素材居中裁切为微信公众号 900×383 封面。 */
    cropWechatCover: (
      sourcePath: string
    ) => Promise<{ filePath: string; width: number; height: number }>
    /** 清理网络缓存但保留用户数据。 */
    clearCache: () => Promise<boolean>
    /** 从 HTTPS 页面可读 DOM 导入文章；`url` 是用户提供的文章地址。 */
    importArticleUrl: (
      url: string
    ) => Promise<{ title: string; markdown: string }>
    /** 从系统文件选择器导入 Markdown。 */
    importMarkdown: () => Promise<{ title: string; markdown: string } | null>
    /** 从磁盘导入 SKILL.md。 */
    importSkill: () => Promise<{
      name: string
      category: string
      prompt: string
    } | null>
    /** 导出文章；`request` 包含标题、Markdown 与目标格式。 */
    exportArticle: (request: {
      title: string
      markdown: string
      format: 'md' | 'html' | 'pure-html' | 'pdf'
    }) => Promise<{ filePath: string } | null>
    /** 选择并持久绑定本地内容目录。 */
    bindContentFolder: () => Promise<string | null>
    /** 与已绑定目录双向同步 Markdown；`documents` 是当前文稿列表。 */
    syncContentFolder: (
      documents: import('../domain/studio').StudioDocument[]
    ) => Promise<import('../domain/studio').StudioDocument[]>
    /** 生成 Cursor JSON 与 Codex TOML MCP 配置。 */
    getMcpConfig: () => Promise<{ cursor: string; codex: string }>
    /** 同步平台草稿并返回平台适配结果。 */
    syncDraft: (request: {
      platformId: string
      title: string
      markdown: string
      mode?: 'api' | 'ui'
      appId?: string
      appSecret?: string
      cover?: string
      author?: string
      sourceUrl?: string
      needOpenComment?: boolean
      onlyFansCanComment?: boolean
      accountId?: string
    }) => Promise<{
      success: boolean
      draftId?: string
      message: string
      requiresLogin?: boolean
    }>
  }
}
