// Electron preload 安全桥：使用 CommonJS 确保在 contextIsolation 环境和打包应用中稳定加载。
const { contextBridge, ipcRenderer } = require('electron')

// visualMuseStore 存储主题与发布配置的受限持久化 API。
const visualMuseStore = {
  /** 读取本地主题与发布配置。 */
  getState: async () => ipcRenderer.invoke('visual-muse:get-state'),
  /** 写入本地主题与发布配置；state 为待持久化状态。 */
  setState: async (state) => ipcRenderer.invoke('visual-muse:set-state', state),
}

// visualMuseDesktop 存储更新、剪贴板和平台入口的受限桌面 API。
const visualMuseDesktop = {
  /** 检查 GitHub Release 新版本。 */
  checkAppUpdate: async () => ipcRenderer.invoke('app-update:check'),
  /** 下载完整安装包。 */
  downloadAppUpdate: async () => ipcRenderer.invoke('app-update:download'),
  /** 安装已下载版本并重启。 */
  installAppUpdate: async () => ipcRenderer.invoke('app-update:install'),
  /** 复制文本到系统剪贴板；text 为待复制内容。 */
  copyText: async (text) => ipcRenderer.invoke('visual-muse:copy-text', text),
  /** 打开平台创作入口；platformId 为主进程白名单中的平台标识。 */
  openPublisher: async (platformId) =>
    ipcRenderer.invoke('visual-muse:open-publisher', platformId),
}

// visualMuseWorkspace 存储功能工作区、模型代理、热榜、账号和素材的受限 API。
const visualMuseWorkspace = {
  /** 读取完整功能工作区。 */
  getState: async () => ipcRenderer.invoke('visual-muse:get-workspace'),
  /** 写入完整功能工作区；state 为可序列化状态。 */
  setState: async (state) =>
    ipcRenderer.invoke('visual-muse:set-workspace', state),
  /** 导出图文卡片；cards 为 Markdown 数组，theme 为配色对象。 */
  exportCards: async (cards, theme) =>
    ipcRenderer.invoke('visual-muse:export-cards', cards, theme),
  /** 调用本地配置的写作模型；request 包含模型与提示词。 */
  generateText: async (request) =>
    ipcRenderer.invoke('visual-muse:generate-text', request),
  /** 刷新白名单热榜来源。 */
  fetchTrends: async (sourceId) =>
    ipcRenderer.invoke('visual-muse:fetch-trends', sourceId),
  /** 打开平台独立持久登录窗口。 */
  openAccountLogin: async (platformId, accountId) =>
    ipcRenderer.invoke('visual-muse:open-account', platformId, accountId),
  /** 打开公众号官方 API 凭据设置页。 */
  openAccountSettings: async (platformId, accountId) =>
    ipcRenderer.invoke(
      'visual-muse:open-account-settings',
      platformId,
      accountId
    ),
  /** 检查平台持久会话状态。 */
  checkAccount: async (platformId, accountId) =>
    ipcRenderer.invoke('visual-muse:check-account', platformId, accountId),
  /** 清除指定平台账号槽位的登录数据。 */
  logoutAccount: async (platformId, accountId) =>
    ipcRenderer.invoke('visual-muse:logout-account', platformId, accountId),
  /** 选择图片素材文件。 */
  importAssets: async () => ipcRenderer.invoke('visual-muse:import-assets'),
  /** 将本地图片居中裁切为微信公众号 900×383 封面。 */
  cropWechatCover: async (sourcePath) =>
    ipcRenderer.invoke('visual-muse:crop-wechat-cover', sourcePath),
  /** 清理网络缓存但保留用户工作区与登录数据。 */
  clearCache: async () => ipcRenderer.invoke('visual-muse:clear-cache'),
  /** 从 HTTPS 页面可读 DOM 导入文章。 */
  importArticleUrl: async (url) =>
    ipcRenderer.invoke('visual-muse:import-article-url', url),
  /** 从系统文件选择器导入 Markdown。 */
  importMarkdown: async () => ipcRenderer.invoke('visual-muse:import-markdown'),
  /** 从磁盘导入 SKILL.md。 */
  importSkill: async () => ipcRenderer.invoke('visual-muse:import-skill'),
  /** 导出 MD、HTML、纯 HTML 或 PDF。 */
  exportArticle: async (request) =>
    ipcRenderer.invoke('visual-muse:export-article', request),
  /** 选择并绑定本地内容目录。 */
  bindContentFolder: async () =>
    ipcRenderer.invoke('visual-muse:bind-content-folder'),
  /** 与已绑定目录双向同步 Markdown。 */
  syncContentFolder: async (documents) =>
    ipcRenderer.invoke('visual-muse:sync-content-folder', documents),
  /** 生成 Cursor 与 Codex MCP 配置。 */
  getMcpConfig: async () => ipcRenderer.invoke('visual-muse:get-mcp-config'),
  /** 同步平台草稿；request 包含平台、文章和可选公众号凭据。 */
  syncDraft: async (request) =>
    ipcRenderer.invoke('visual-muse:sync-draft', request),
}

contextBridge.exposeInMainWorld('visualMuseRuntime', {
  platform: process.platform,
})
contextBridge.exposeInMainWorld('visualMuseStore', visualMuseStore)
contextBridge.exposeInMainWorld('visualMuseDesktop', visualMuseDesktop)
contextBridge.exposeInMainWorld('visualMuseWorkspace', visualMuseWorkspace)
