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
  /** 打开持久平台会话并填充文章；request 为经过渲染层预检的文章数据。 */
  preparePublisher: async (request) =>
    ipcRenderer.invoke('visual-muse:prepare-publisher', request),
}

contextBridge.exposeInMainWorld('visualMuseRuntime', {
  platform: process.platform,
})
contextBridge.exposeInMainWorld('visualMuseStore', visualMuseStore)
contextBridge.exposeInMainWorld('visualMuseDesktop', visualMuseDesktop)
