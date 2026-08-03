import { contextBridge, ipcRenderer } from 'electron'

interface VisualMuseStoreState {
  /** 当前界面主题模式。 */
  themeMode: 'dark' | 'light'
  /** 发布相关配置。 */
  settings: Record<string, string>
}

/**
 * 暴露安全的 preload API；无参数，当前阶段仅提供运行环境探针。
 */
function exposePreloadApi(): void {
  contextBridge.exposeInMainWorld('visualMuseRuntime', {
    platform: process.platform,
  })
  contextBridge.exposeInMainWorld('visualMuseStore', {
    /**
     * 读取本地状态；无参数，返回主题和发布配置。
     */
    getState: async (): Promise<VisualMuseStoreState | null> =>
      ipcRenderer.invoke('visual-muse:get-state'),
    /**
     * 写入本地状态；`state` 是需要保存的主题和发布配置。
     */
    setState: async (state: VisualMuseStoreState): Promise<void> =>
      ipcRenderer.invoke('visual-muse:set-state', state),
  })
  contextBridge.exposeInMainWorld('visualMuseWorkspace', {
    /** 读取文稿、主题、Skill、任务和素材工作区。 */
    getState: async (): Promise<unknown | null> =>
      ipcRenderer.invoke('visual-muse:get-workspace'),
    /** 写入完整功能工作区；`state` 是可序列化状态。 */
    setState: async (state: unknown): Promise<void> =>
      ipcRenderer.invoke('visual-muse:set-workspace', state),
    /** 导出图文卡片；`cards` 是 Markdown 数组，`theme` 是配色对象。 */
    exportCards: async (
      cards: string[],
      theme: unknown
    ): Promise<{ count: number; directory: string }> =>
      ipcRenderer.invoke('visual-muse:export-cards', cards, theme),
    /** 调用本地配置的写作模型；`request` 包含模型与提示词。 */
    generateText: async (request: unknown): Promise<{ content: string }> =>
      ipcRenderer.invoke('visual-muse:generate-text', request),
    /** 刷新热榜；`sourceId` 是白名单来源标识。 */
    fetchTrends: async (
      sourceId: string
    ): Promise<Array<{ title: string; url: string; hot: string }>> =>
      ipcRenderer.invoke('visual-muse:fetch-trends', sourceId),
    /** 打开平台登录窗口；`platformId` 是平台白名单标识。 */
    openAccountLogin: async (
      platformId: string,
      accountId?: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('visual-muse:open-account', platformId, accountId),
    /** 打开公众号官方 API 凭据设置页。 */
    openAccountSettings: async (
      platformId: string,
      accountId?: string
    ): Promise<boolean> =>
      ipcRenderer.invoke(
        'visual-muse:open-account-settings',
        platformId,
        accountId
      ),
    /** 检查平台账号状态；`platformId` 是平台白名单标识。 */
    checkAccount: async (
      platformId: string,
      accountId?: string
    ): Promise<{ authenticated: boolean; message: string }> =>
      ipcRenderer.invoke('visual-muse:check-account', platformId, accountId),
    /** 清除指定平台账号槽位的登录数据。 */
    logoutAccount: async (
      platformId: string,
      accountId?: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('visual-muse:logout-account', platformId, accountId),
    /** 选择并导入图片素材。 */
    importAssets: async (): Promise<string[]> =>
      ipcRenderer.invoke('visual-muse:import-assets'),
    /** 将本地图片居中裁切为微信公众号 900×383 封面。 */
    cropWechatCover: async (
      sourcePath: string
    ): Promise<{ filePath: string; width: number; height: number }> =>
      ipcRenderer.invoke('visual-muse:crop-wechat-cover', sourcePath),
    /** 清理 Chromium 网络缓存，不删除文稿和登录数据。 */
    clearCache: async (): Promise<boolean> =>
      ipcRenderer.invoke('visual-muse:clear-cache'),
    /** 从 HTTPS 页面可读 DOM 导入文章。 */
    importArticleUrl: async (
      url: string
    ): Promise<{ title: string; markdown: string }> =>
      ipcRenderer.invoke('visual-muse:import-article-url', url),
    /** 从系统文件选择器导入 Markdown。 */
    importMarkdown: async (): Promise<{
      title: string
      markdown: string
    } | null> => ipcRenderer.invoke('visual-muse:import-markdown'),
    /** 从磁盘导入 SKILL.md。 */
    importSkill: async (): Promise<{
      name: string
      category: string
      prompt: string
    } | null> => ipcRenderer.invoke('visual-muse:import-skill'),
    /** 导出 MD、HTML、纯 HTML 或 PDF。 */
    exportArticle: async (
      request: unknown
    ): Promise<{ filePath: string } | null> =>
      ipcRenderer.invoke('visual-muse:export-article', request),
    /** 选择并绑定本地内容目录。 */
    bindContentFolder: async (): Promise<string | null> =>
      ipcRenderer.invoke('visual-muse:bind-content-folder'),
    /** 与已绑定目录双向同步 Markdown。 */
    syncContentFolder: async (documents: unknown[]): Promise<unknown[]> =>
      ipcRenderer.invoke('visual-muse:sync-content-folder', documents),
    /** 生成 Cursor 与 Codex MCP 配置。 */
    getMcpConfig: async (): Promise<{ cursor: string; codex: string }> =>
      ipcRenderer.invoke('visual-muse:get-mcp-config'),
    /** 同步平台草稿；`request` 包含平台、文章和可选公众号凭据。 */
    syncDraft: async (request: unknown): Promise<unknown> =>
      ipcRenderer.invoke('visual-muse:sync-draft', request),
  })
  contextBridge.exposeInMainWorld('visualMuseDesktop', {
    /** 检查 GitHub Release 新版本。 */
    checkAppUpdate: async (): Promise<{
      available: boolean
      version?: string
      downloaded?: boolean
    }> => ipcRenderer.invoke('app-update:check'),
    /** 下载完整安装包。 */
    downloadAppUpdate: async (): Promise<{ downloaded: boolean }> =>
      ipcRenderer.invoke('app-update:download'),
    /** 安装已下载版本并重启。 */
    installAppUpdate: async (): Promise<boolean> =>
      ipcRenderer.invoke('app-update:install'),
    /**
     * 复制文本到系统剪贴板；`text` 是待复制的标题或正文。
     */
    copyText: async (text: string): Promise<void> =>
      ipcRenderer.invoke('visual-muse:copy-text', text),
    /**
     * 打开平台创作入口；`platformId` 是预置白名单中的平台标识。
     */
    openPublisher: async (platformId: string): Promise<void> =>
      ipcRenderer.invoke('visual-muse:open-publisher', platformId),
  })
}

exposePreloadApi()
