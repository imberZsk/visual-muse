import { contextBridge, ipcRenderer } from "electron";

interface VisualMuseStoreState {
  /** 当前界面主题模式。 */
  themeMode: "dark" | "light";
  /** 发布相关配置。 */
  settings: Record<string, string>;
}

/**
 * 暴露安全的 preload API；无参数，当前阶段仅提供运行环境探针。
 */
function exposePreloadApi(): void {
  contextBridge.exposeInMainWorld("visualMuseRuntime", {
    platform: process.platform,
  });
  contextBridge.exposeInMainWorld("visualMuseStore", {
    /**
     * 读取本地状态；无参数，返回主题和发布配置。
     */
    getState: async (): Promise<VisualMuseStoreState | null> => ipcRenderer.invoke("visual-muse:get-state"),
    /**
     * 写入本地状态；`state` 是需要保存的主题和发布配置。
     */
    setState: async (state: VisualMuseStoreState): Promise<void> => ipcRenderer.invoke("visual-muse:set-state", state),
  });
  contextBridge.exposeInMainWorld("visualMuseDesktop", {
    /**
     * 复制文本到系统剪贴板；`text` 是待复制的标题或正文。
     */
    copyText: async (text: string): Promise<void> => ipcRenderer.invoke("visual-muse:copy-text", text),
    /**
     * 打开平台创作入口；`platformId` 是预置白名单中的平台标识。
     */
    openPublisher: async (platformId: string): Promise<void> =>
      ipcRenderer.invoke("visual-muse:open-publisher", platformId),
  });
}

exposePreloadApi();
