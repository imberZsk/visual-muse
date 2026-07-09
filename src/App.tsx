import {
  Alert,
  Badge,
  Button,
  ConfigProvider,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  Timeline,
  Typography,
  theme,
} from "antd";
import {
  BookOpen,
  Code2,
  FileText,
  History,
  KeyRound,
  MessageSquareText,
  Moon,
  Newspaper,
  PenLine,
  Send,
  Server,
  Settings,
  Sun,
  WandSparkles,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  buildWechatDraftPayload,
  parseArticleMarkdown,
  publishingPlatforms,
  simulatePublish,
  validatePublishTarget,
  type ParsedArticle,
  type PlatformId,
  type PublishPlatform,
  type PublishResult,
  type PublishValidation,
  type WechatDraftPayload,
} from "./domain/publisher";
import "./styles.css";

type ThemeMode = "dark" | "light";

interface PublisherSettings {
  /** 微信公众号 AppID，用于后续接入真实公众号发布。 */
  appId: string;
  /** 微信公众号 AppSecret，用于后续换取 AccessToken。 */
  appSecret: string;
  /** WenYan Server 地址，用于远程发布模式。 */
  serverUrl: string;
  /** WenYan Server API Key，用于远程发布鉴权。 */
  apiKey: string;
  /** 代理地址，用于本地 API 请求代理。 */
  proxyUrl: string;
  /** 默认排版主题。 */
  defaultTheme: string;
}

interface VisualMuseState {
  /** 当前界面主题模式。 */
  themeMode: ThemeMode;
  /** 发布相关配置。 */
  settings: PublisherSettings;
}

interface PlatformIconProps {
  /** 需要渲染图标的平台标识。 */
  platformId: PlatformId;
}

interface PreviewPanelProps {
  /** 当前选中的发布平台。 */
  platform: PublishPlatform;
  /** 当前文章解析结果。 */
  article: ParsedArticle;
  /** 当前公众号载荷。 */
  wechatPayload: WechatDraftPayload;
}

/** 本地状态存储键，用于浏览器预览和测试环境降级持久化。 */
const browserStateKey = "visual-muse-state";

/** 默认示例文章，用于应用首次打开时展示可发布内容。 */
const defaultMarkdown = `---
title: Visual Muse 深色工作台发布说明
cover: https://example.com/cover.png
author: Visual Muse
source_url: https://example.com/source
need_open_comment: true
---

# Visual Muse 深色工作台

这是一篇用于预览和模拟发布的 Markdown 文章。

## 发布目标

- 微信公众号图文草稿
- 知乎、今日头条、掘金、CSDN、Medium 内容适配

> 让写作者先看见结构、状态和结果，再决定是否接入真实平台 API。`;

/** 默认发布设置，用于初始化配置表单。 */
const defaultSettings: PublisherSettings = {
  appId: "",
  appSecret: "",
  serverUrl: "",
  apiKey: "",
  proxyUrl: "",
  defaultTheme: "default",
};

/** 平台图标组件映射，用于保持导航图标风格一致。 */
const platformIconMap = {
  wechat: MessageSquareText,
  zhihu: PenLine,
  toutiao: Newspaper,
  juejin: Code2,
  csdn: FileText,
  medium: BookOpen,
} satisfies Record<PlatformId, typeof MessageSquareText>;

/**
 * 渲染平台图标；`platformId` 表示当前要展示的目标平台。
 */
function PlatformIcon({ platformId }: PlatformIconProps) {
  // 平台图标组件，保存当前平台对应的 Lucide 图标。
  const IconComponent = platformIconMap[platformId];

  return <IconComponent aria-hidden="true" size={18} strokeWidth={1.8} />;
}

/**
 * 读取浏览器降级状态；无参数，返回本地存储中的主题和发布配置。
 */
function readBrowserState(): VisualMuseState | null {
  // 本地存储原始字符串，保存上一次持久化的 JSON 状态。
  const rawState = window.localStorage.getItem(browserStateKey);

  // 业务场景：首次打开应用时没有历史状态，直接使用默认值。
  if (!rawState) {
    return null;
  }

  try {
    return JSON.parse(rawState) as VisualMuseState;
  } catch {
    return null;
  }
}

/**
 * 写入浏览器降级状态；`state` 是需要保存的主题和发布配置。
 */
function writeBrowserState(state: VisualMuseState): void {
  window.localStorage.setItem(browserStateKey, JSON.stringify(state));
}

/**
 * 读取持久化状态；无参数，桌面环境优先使用 Electron preload API。
 */
async function loadPersistedState(): Promise<VisualMuseState | null> {
  // 桌面存储 API，保存 preload 暴露的安全 IPC 能力。
  const desktopStore = window.visualMuseStore;

  // 业务场景：Electron 桌面端使用主进程 JSON 文件，Web 测试环境使用 localStorage。
  if (desktopStore) {
    return desktopStore.getState();
  }

  return readBrowserState();
}

/**
 * 保存持久化状态；`state` 是需要保存的主题和发布配置。
 */
async function savePersistedState(state: VisualMuseState): Promise<void> {
  // 桌面存储 API，保存 preload 暴露的安全 IPC 能力。
  const desktopStore = window.visualMuseStore;

  // 业务场景：Electron 桌面端使用主进程 JSON 文件，Web 测试环境使用 localStorage。
  if (desktopStore) {
    await desktopStore.setState(state);
    return;
  }

  writeBrowserState(state);
}

/**
 * 渲染预览面板；`platform` 是目标平台，`article` 是文章内容，`wechatPayload` 是公众号载荷。
 */
function PreviewPanel({ platform, article, wechatPayload }: PreviewPanelProps) {
  // HTML 预览内容，保存当前平台可视化展示所需的正文。
  const previewHtml = buildPreviewHtml(platform, article, wechatPayload);

  return (
    <section className="preview-surface" aria-label="发布预览">
      <div className="panel-heading">
        <Space size={10}>
          <EyeIcon />
          <Typography.Text strong>发布预览</Typography.Text>
        </Space>
        <Tag className="neutral-tag">
          {platform.id === "wechat" ? (wechatPayload.kind === "image" ? "图片消息" : "图文草稿") : "平台预览"}
        </Tag>
      </div>
      <div className="preview-document">
        <Typography.Title level={2}>{article.metadata.title || "未命名文章"}</Typography.Title>
        <Typography.Text type="secondary">{article.metadata.author || "未设置作者"}</Typography.Text>
        <Divider />
        <div className="article-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>
    </section>
  );
}

/**
 * 渲染预览标题图标；无参数，用于避免直接使用没有语义标签的装饰图形。
 */
function EyeIcon() {
  return <WandSparkles aria-hidden="true" size={18} strokeWidth={1.8} />;
}

/**
 * 构建平台预览 HTML；`platform` 是目标平台，`article` 是文章，`wechatPayload` 是公众号载荷。
 */
function buildPreviewHtml(platform: PublishPlatform, article: ParsedArticle, wechatPayload: WechatDraftPayload): string {
  // 业务场景：微信公众号普通图文直接展示将要提交的 HTML 内容。
  if (platform.id === "wechat" && wechatPayload.kind === "article") {
    return wechatPayload.articles[0].content;
  }

  // 业务场景：微信公众号图片消息以图片路径列表和描述为主体，不渲染为普通图文。
  if (platform.id === "wechat" && wechatPayload.kind === "image") {
    return `<p>${escapeHtml(wechatPayload.content || "图片消息正文为空")}</p><ul>${wechatPayload.image_list
      .map((imagePath) => `<li>${escapeHtml(imagePath)}</li>`)
      .join("")}</ul>`;
  }

  return `<pre>${escapeHtml(article.body)}</pre>`;
}

/**
 * 转义 HTML 文本；`value` 是需要安全展示的原始字符串。
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Visual Muse 根组件；无参数，负责组装编辑、预览、平台和发布状态。
 */
export default function App() {
  // 当前主题模式，保存深色或浅色状态。
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  // 当前选中平台，保存平台导航的 active 项。
  const [selectedPlatformId, setSelectedPlatformId] = useState<PlatformId>("wechat");
  // Markdown 编辑内容，保存用户正在编辑的文章。
  const [markdown, setMarkdown] = useState(defaultMarkdown);
  // 发布配置，保存公众号凭据、Server 和主题偏好。
  const [settingsState, setSettingsState] = useState<PublisherSettings>(defaultSettings);
  // 预检结果，保存最近一次发布预检的错误和警告。
  const [validation, setValidation] = useState<PublishValidation | null>(null);
  // 发布记录列表，保存最近的模拟发布结果。
  const [publishResults, setPublishResults] = useState<PublishResult[]>([]);

  // 当前平台对象，保存由平台 ID 找到的完整平台定义。
  const selectedPlatform = useMemo(
    () => publishingPlatforms.find((platform) => platform.id === selectedPlatformId) ?? publishingPlatforms[0],
    [selectedPlatformId],
  );
  // 当前文章解析结果，保存 frontmatter 和正文。
  const parsedArticle = useMemo(() => parseArticleMarkdown(markdown), [markdown]);
  // 当前公众号载荷，保存普通图文或图片消息的提交结构。
  const wechatPayload = useMemo(() => buildWechatDraftPayload(parsedArticle), [parsedArticle]);
  // Ant Design 主题算法，保存深浅主题对应的 token 计算方式。
  const antThemeAlgorithm = themeMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm;
  // Ant Design 主题 token，保存界面主色、圆角和字体。
  const antThemeTokens = {
    colorPrimary: themeMode === "dark" ? "#D3D3CE" : "#303232",
    colorInfo: themeMode === "dark" ? "#D3D3CE" : "#303232",
    colorLink: themeMode === "dark" ? "#D3D3CE" : "#303232",
    colorSuccess: themeMode === "dark" ? "#C7C7C1" : "#3B3D3D",
    colorWarning: themeMode === "dark" ? "#B8B8B2" : "#555757",
    colorError: themeMode === "dark" ? "#AFAFAA" : "#606262",
    colorBgBase: themeMode === "dark" ? "#141516" : "#ECECEA",
    colorTextBase: themeMode === "dark" ? "#E8E8E4" : "#1C1D1D",
    colorBorder: themeMode === "dark" ? "#4A4B49" : "#C6C6C1",
    colorTextLightSolid: themeMode === "dark" ? "#151616" : "#F4F4F1",
    borderRadius: 8,
    fontFamily:
      '"Public Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  useEffect(() => {
    // 组件挂载标记，保存异步加载期间组件是否仍然存在。
    let isMounted = true;

    void loadPersistedState().then((persistedState) => {
      // 业务场景：没有历史状态时保持默认深色主题和空配置。
      if (!persistedState || !isMounted) {
        return;
      }

      setThemeMode(persistedState.themeMode);
      setSettingsState({ ...defaultSettings, ...persistedState.settings });
    });

    /**
     * 清理持久化加载副作用；无参数，用于避免卸载后更新状态。
     */
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // 待保存状态，保存主题和发布配置的最新值。
    const nextState: VisualMuseState = {
      themeMode,
      settings: settingsState,
    };

    void savePersistedState(nextState);
  }, [settingsState, themeMode]);

  /**
   * 切换主题；`checked` 表示是否启用浅色主题。
   */
  const handleThemeChange = (checked: boolean): void => {
    setThemeMode(checked ? "light" : "dark");
  };

  /**
   * 更新 Markdown；`event` 是文本域变更事件。
   */
  const handleMarkdownChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setMarkdown(event.target.value);
    setValidation(null);
  };

  /**
   * 更新发布配置字段；`field` 是配置键，`value` 是表单输入值。
   */
  const updateSetting = (field: keyof PublisherSettings, value: string): void => {
    setSettingsState((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }));
  };

  /**
   * 执行发布预检；无参数，基于当前平台和文章生成校验结果。
   */
  const handlePreflight = (): void => {
    // 预检结果，保存当前平台对文章的校验反馈。
    const nextValidation = validatePublishTarget(selectedPlatform, parsedArticle);

    setValidation(nextValidation);
  };

  /**
   * 执行模拟发布；无参数，预检通过后写入发布历史。
   */
  const handleSimulatePublish = (): void => {
    // 预检结果，保存模拟发布前的阻断错误和提示。
    const nextValidation = validatePublishTarget(selectedPlatform, parsedArticle);

    setValidation(nextValidation);

    // 业务场景：缺少标题等必填项时阻止模拟发布，保持行为接近真实平台。
    if (!nextValidation.ok) {
      return;
    }

    // 模拟发布结果，保存本次发布成功后的记录。
    const nextResult = simulatePublish(selectedPlatform, parsedArticle);

    setPublishResults((currentResults) => [nextResult, ...currentResults].slice(0, 5));
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: antThemeAlgorithm,
        token: antThemeTokens,
      }}
    >
      <main className="app-shell" data-theme={themeMode} data-testid="app-shell">
        <aside className="platform-rail" aria-label="发布平台">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Send aria-hidden="true" size={20} strokeWidth={1.9} />
            </div>
            <div>
              <Typography.Title level={1}>Visual Muse</Typography.Title>
              <Typography.Text>文章发布工作台</Typography.Text>
            </div>
          </div>

          <div className="platform-list">
            {publishingPlatforms.map((platform) => (
              <Button
                block
                className="platform-button"
                icon={<PlatformIcon platformId={platform.id} />}
                key={platform.id}
                onClick={() => setSelectedPlatformId(platform.id)}
                type={platform.id === selectedPlatformId ? "primary" : "text"}
              >
                {platform.name}
              </Button>
            ))}
          </div>

          <div className="rail-footer">
            <Space align="center" size={10}>
              {themeMode === "dark" ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
              <Switch aria-label="主题切换" checked={themeMode === "light"} onChange={handleThemeChange} />
            </Space>
          </div>
        </aside>

        <section className="workspace" aria-label="文章编辑工作区">
          <header className="workspace-header">
            <div>
              <Typography.Text className="section-kicker">Publishing Console</Typography.Text>
              <Typography.Title level={2}>多平台可视化发布</Typography.Title>
              <Typography.Paragraph className="platform-capability">{selectedPlatform.capability}</Typography.Paragraph>
            </div>
            <Space wrap>
              <Tag className="neutral-tag">{selectedPlatform.name}</Tag>
              <Tag className="neutral-tag">默认深色</Tag>
            </Space>
          </header>

          <div className="editor-preview-grid">
            <section className="editor-surface" aria-label="Markdown 编辑">
              <div className="panel-heading">
                <Space size={10}>
                  <FileText aria-hidden="true" size={18} strokeWidth={1.8} />
                  <Typography.Text strong>Markdown</Typography.Text>
                </Space>
                <Badge status="default" text={parsedArticle.metadata.title || "缺少标题"} />
              </div>
              <Input.TextArea
                aria-label="Markdown 编辑器"
                className="markdown-editor"
                onChange={handleMarkdownChange}
                spellCheck={false}
                value={markdown}
              />
            </section>

            <PreviewPanel article={parsedArticle} platform={selectedPlatform} wechatPayload={wechatPayload} />
          </div>
        </section>

        <aside className="publish-panel" aria-label="发布配置">
          <div className="panel-block">
            <div className="panel-heading">
              <Space size={10}>
                <Settings aria-hidden="true" size={18} strokeWidth={1.8} />
                <Typography.Text strong>平台配置</Typography.Text>
              </Space>
            </div>

            <Form layout="vertical" size="middle">
              <Form.Item label="AppID">
                <Input
                  autoComplete="username"
                  onChange={(event) => updateSetting("appId", event.target.value)}
                  prefix={<KeyRound aria-hidden="true" size={16} />}
                  value={settingsState.appId}
                />
              </Form.Item>
              <Form.Item label="AppSecret">
                <Input.Password
                  autoComplete="current-password"
                  onChange={(event) => updateSetting("appSecret", event.target.value)}
                  prefix={<KeyRound aria-hidden="true" size={16} />}
                  value={settingsState.appSecret}
                />
              </Form.Item>
              <Form.Item label="Server">
                <Input
                  onChange={(event) => updateSetting("serverUrl", event.target.value)}
                  prefix={<Server aria-hidden="true" size={16} />}
                  type="url"
                  value={settingsState.serverUrl}
                />
              </Form.Item>
              <Form.Item label="API Key">
                <Input
                  onChange={(event) => updateSetting("apiKey", event.target.value)}
                  prefix={<KeyRound aria-hidden="true" size={16} />}
                  value={settingsState.apiKey}
                />
              </Form.Item>
              <Form.Item label="代理">
                <Input
                  onChange={(event) => updateSetting("proxyUrl", event.target.value)}
                  placeholder="http://127.0.0.1:7890"
                  type="url"
                  value={settingsState.proxyUrl}
                />
              </Form.Item>
              <Form.Item label="默认主题">
                <Select
                  onChange={(value) => updateSetting("defaultTheme", value)}
                  options={[
                    { label: "Default", value: "default" },
                    { label: "Orange Heart", value: "orange-heart" },
                    { label: "Lapis", value: "lapis" },
                    { label: "Rainbow", value: "rainbow" },
                    { label: "Phycat Mint", value: "phycat" },
                  ]}
                  value={settingsState.defaultTheme}
                />
              </Form.Item>
            </Form>
          </div>

          <div className="panel-block">
            <div className="panel-heading">
              <Space size={10}>
                <WandSparkles aria-hidden="true" size={18} strokeWidth={1.8} />
                <Typography.Text strong>发布动作</Typography.Text>
              </Space>
            </div>
            <Space className="action-row" orientation="vertical" size={12}>
              <Button block icon={<FileText aria-hidden="true" size={16} />} onClick={handlePreflight}>
                发布预检
              </Button>
              <Button block icon={<Send aria-hidden="true" size={16} />} onClick={handleSimulatePublish} type="primary">
                模拟发布
              </Button>
            </Space>

            {validation && (
              <Alert
                className="status-alert"
                description={
                  validation.ok
                    ? validation.warnings.length > 0
                      ? validation.warnings.join("；")
                      : "当前文章可以进入模拟发布流程"
                    : validation.errors.join("；")
                }
                showIcon
                title={validation.ok ? "预检通过" : "预检未通过"}
                type={validation.ok ? "success" : "error"}
              />
            )}
          </div>

          <div className="panel-block">
            <div className="panel-heading">
              <Space size={10}>
                <History aria-hidden="true" size={18} strokeWidth={1.8} />
                <Typography.Text strong>发布记录</Typography.Text>
              </Space>
            </div>
            {publishResults.length === 0 ? (
              <div className="empty-history">暂无发布记录</div>
            ) : (
              <Timeline
                items={publishResults.map((result) => ({
                  color: themeMode === "dark" ? "#D3D3CE" : "#303232",
                  content: (
                    <Space orientation="vertical" size={4}>
                      <Typography.Text strong>发布模拟成功</Typography.Text>
                      <Typography.Text>{result.mediaId}</Typography.Text>
                      <Typography.Text type="secondary">{result.title}</Typography.Text>
                    </Space>
                  ),
                }))}
              />
            )}
          </div>
        </aside>
      </main>
    </ConfigProvider>
  );
}
