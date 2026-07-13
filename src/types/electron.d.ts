interface VisualMuseStoreState {
  /** 当前界面主题模式。 */
  themeMode: "dark" | "light";
  /** 发布相关配置。 */
  settings: {
    /** 微信公众号 AppID。 */
    appId: string;
    /** 微信公众号 AppSecret。 */
    appSecret: string;
    /** WenYan Server 地址。 */
    serverUrl: string;
    /** WenYan Server API Key。 */
    apiKey: string;
    /** 代理地址。 */
    proxyUrl: string;
    /** 默认排版主题。 */
    defaultTheme: string;
  };
}

interface Window {
  /** Electron preload 暴露的剪贴板与平台入口 API。 */
  visualMuseDesktop?: {
    /** 复制文本到系统剪贴板；`text` 是待复制内容。 */
    copyText: (text: string) => Promise<void>;
    /** 打开平台创作入口；`platformId` 是平台标识。 */
    openPublisher: (platformId: string) => Promise<void>;
  };
  /** Electron preload 暴露的本地状态存储 API。 */
  visualMuseStore?: {
    /** 读取本地状态；无参数，返回主题和发布配置。 */
    getState: () => Promise<VisualMuseStoreState | null>;
    /** 写入本地状态；`state` 是需要保存的主题和发布配置。 */
    setState: (state: VisualMuseStoreState) => Promise<void>;
  };
  /** Electron preload 暴露的运行时信息。 */
  visualMuseRuntime?: {
    /** 当前操作系统平台。 */
    platform: string;
  };
}
