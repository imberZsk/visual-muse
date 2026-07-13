import {
  Alert,
  Button,
  ConfigProvider,
  Divider,
  Empty,
  Form,
  Input,
  message,
  Skeleton,
  Select,
  Space,
  Switch,
  Tag,
  Timeline,
  Tooltip,
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
  Check,
  Cloud,
  Copy,
  ExternalLink,
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

interface ContentPlatformOptions {
  /** 平台文章分类，用于发布前记录目标内容频道。 */
  category: string;
  /** 平台文章标签，用逗号分隔。 */
  tags: string;
  /** 平台文章摘要，用于复制到平台发布表单。 */
  summary: string;
}

/** 本地状态存储键，用于浏览器预览和测试环境降级持久化。 */
const browserStateKey = "visual-muse-state";

/** 自动保存延迟毫秒数，用于合并用户连续输入产生的磁盘写入。 */
const autoSaveDelayMs = 500;

/** 模拟发布延迟毫秒数，用于呈现真实异步发布过程的交互状态。 */
const simulatedPublishDelayMs = 650;

/** 平台创作入口地址，用于 Web 预览环境降级打开官方发布页面。 */
const publisherUrlMap: Record<PlatformId, string> = {
  wechat: "https://mp.weixin.qq.com/",
  zhihu: "https://www.zhihu.com/creator",
  toutiao: "https://mp.toutiao.com/",
  juejin: "https://juejin.cn/editor/drafts/new?v=2",
  csdn: "https://editor.csdn.net/md/",
  medium: "https://medium.com/new-story",
};

/** 默认内容平台选项，用于初始化分类、标签和摘要。 */
const defaultContentOptions: ContentPlatformOptions = {
  category: "",
  tags: "",
  summary: "",
};

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
  // 全局消息 API，保存复制和打开平台后的非阻断反馈能力。
  const [messageApi, messageContextHolder] = message.useMessage();
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
  // 初始化状态，保存持久化配置是否已经读取完成。
  const [isHydrated, setIsHydrated] = useState(false);
  // 自动保存状态，保存配置是否正在写入本地存储。
  const [isSaving, setIsSaving] = useState(false);
  // 发布状态，保存模拟发布异步流程是否正在执行。
  const [isPublishing, setIsPublishing] = useState(false);
  // 快捷操作状态，保存当前正在执行的复制或打开平台动作。
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  // 内容平台选项，保存各平台独立的分类、标签和摘要输入。
  const [contentOptions, setContentOptions] = useState<Record<PlatformId, ContentPlatformOptions>>(() =>
    Object.fromEntries(
      publishingPlatforms.map((platform) => [platform.id, { ...defaultContentOptions }]),
    ) as Record<PlatformId, ContentPlatformOptions>,
  );

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

    void loadPersistedState()
      .then((persistedState) => {
        // 业务场景：组件卸载后不再更新界面，避免异步状态泄漏。
        if (!isMounted) {
          return;
        }

        // 业务场景：存在历史状态时恢复用户主题和平台配置。
        if (persistedState) {
          setThemeMode(persistedState.themeMode);
          setSettingsState({ ...defaultSettings, ...persistedState.settings });
        }
      })
      .finally(() => {
        // 业务场景：只有仍挂载的界面才能结束启动状态。
        if (isMounted) {
          setIsHydrated(true);
        }
      });

    /**
     * 清理持久化加载副作用；无参数，用于避免卸载后更新状态。
     */
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // 业务场景：持久化读取完成前禁止保存，避免默认值覆盖用户已有配置。
    if (!isHydrated) {
      return undefined;
    }

    // 待保存状态，保存主题和发布配置的最新值。
    const nextState: VisualMuseState = {
      themeMode,
      settings: settingsState,
    };

    // 自动保存定时器，保存合并连续配置修改所需的延迟任务。
    const saveTimer = window.setTimeout(() => {
      setIsSaving(true);
      void savePersistedState(nextState).finally(() => setIsSaving(false));
    }, autoSaveDelayMs);

    /** 清理自动保存任务；无参数，用于配置再次变化时取消旧写入。 */
    return () => window.clearTimeout(saveTimer);
  }, [isHydrated, settingsState, themeMode]);

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
  const handleSimulatePublish = async (): Promise<void> => {
    // 预检结果，保存模拟发布前的阻断错误和提示。
    const nextValidation = validatePublishTarget(selectedPlatform, parsedArticle);

    setValidation(nextValidation);

    // 业务场景：缺少标题等必填项时阻止模拟发布，保持行为接近真实平台。
    if (!nextValidation.ok) {
      return;
    }

    setIsPublishing(true);

    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, simulatedPublishDelayMs));
      // 模拟发布结果，保存本次发布成功后的记录。
      const nextResult = simulatePublish(selectedPlatform, parsedArticle);

      setPublishResults((currentResults) => [nextResult, ...currentResults].slice(0, 5));
    } finally {
      setIsPublishing(false);
    }
  };

  /**
   * 更新内容平台选项；`field` 是选项字段，`value` 是用户输入值。
   */
  const updateContentOption = (field: keyof ContentPlatformOptions, value: string): void => {
    setContentOptions((currentOptions) => ({
      ...currentOptions,
      [selectedPlatformId]: {
        ...currentOptions[selectedPlatformId],
        [field]: value,
      },
    }));
  };

  /**
   * 复制发布内容；`kind` 表示复制标题、正文或完整文章。
   */
  const handleCopyContent = async (kind: "title" | "body" | "all"): Promise<void> => {
    // 当前文章标题，保存复制内容使用的安全标题兜底值。
    const title = parsedArticle.metadata.title?.trim() || "未命名文章";
    // 待复制文本，保存本次快捷操作最终写入剪贴板的内容。
    const copyText = kind === "title" ? title : kind === "body" ? parsedArticle.body : `${title}\n\n${parsedArticle.body}`;
    // 快捷操作标识，保存按钮 loading 状态对应的唯一键。
    const actionKey = `copy-${kind}`;

    setActiveQuickAction(actionKey);

    try {
      // 业务场景：Electron 使用受限 preload API；Web 预览使用标准剪贴板 API。
      if (window.visualMuseDesktop) {
        await window.visualMuseDesktop.copyText(copyText);
      } else {
        await navigator.clipboard.writeText(copyText);
      }

      messageApi.success(kind === "title" ? "标题已复制" : kind === "body" ? "正文已复制" : "标题和正文已复制");
    } catch {
      messageApi.error("复制失败，请检查系统剪贴板权限");
    } finally {
      setActiveQuickAction(null);
    }
  };

  /**
   * 打开当前平台创作入口；无参数，桌面端使用系统浏览器，Web 环境打开新标签页。
   */
  const handleOpenPublisher = async (): Promise<void> => {
    setActiveQuickAction("open-publisher");

    try {
      // 业务场景：桌面端由主进程校验平台白名单，防止渲染进程打开任意外链。
      if (window.visualMuseDesktop) {
        await window.visualMuseDesktop.openPublisher(selectedPlatformId);
      } else {
        window.open(publisherUrlMap[selectedPlatformId], "_blank", "noopener,noreferrer");
      }

      messageApi.success(`已打开${selectedPlatform.name}创作中心`);
    } catch {
      messageApi.error("无法打开创作中心，请稍后重试");
    } finally {
      setActiveQuickAction(null);
    }
  };

  // 正文字数，保存去除首尾空白后的文章字符数量。
  const articleCharacterCount = parsedArticle.body.trim().length;
  // 自动保存提示文本，保存当前配置持久化状态的用户可读描述。
  const saveStatusText = isSaving ? "正在保存" : "已自动保存";

  return (
    <ConfigProvider
      theme={{
        algorithm: antThemeAlgorithm,
        token: antThemeTokens,
      }}
    >
      {messageContextHolder}
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
            <Typography.Text type="secondary">界面主题</Typography.Text>
            <Tooltip title={themeMode === "dark" ? "切换为浅色" : "切换为深色"}>
              <Switch
                aria-label="主题切换"
                checked={themeMode === "light"}
                checkedChildren={<Sun aria-hidden="true" size={13} />}
                onChange={handleThemeChange}
                unCheckedChildren={<Moon aria-hidden="true" size={13} />}
              />
            </Tooltip>
          </div>
        </aside>

        <section className="workspace" aria-label="文章编辑工作区">
          <header className="workspace-header">
            <div>
              <Typography.Text className="section-kicker">{selectedPlatform.name}</Typography.Text>
              <Typography.Title level={2}>{parsedArticle.metadata.title || "未命名文章"}</Typography.Title>
              <Typography.Paragraph className="platform-capability">{selectedPlatform.capability}</Typography.Paragraph>
            </div>
            <div className="save-indicator" aria-live="polite">
              {isSaving ? <Cloud aria-hidden="true" size={15} /> : <Check aria-hidden="true" size={15} />}
              <span>{saveStatusText}</span>
            </div>
          </header>

          {!isHydrated ? (
            <section className="workspace-loading" aria-label="正在加载工作台">
              <Skeleton active paragraph={{ rows: 10 }} title={{ width: "36%" }} />
            </section>
          ) : <div className="editor-preview-grid">
            <section className="editor-surface" aria-label="Markdown 编辑">
              <div className="panel-heading">
                <Space size={10}>
                  <FileText aria-hidden="true" size={18} strokeWidth={1.8} />
                  <Typography.Text strong>Markdown</Typography.Text>
                </Space>
                <Typography.Text type="secondary">{articleCharacterCount} 字</Typography.Text>
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
          </div>}
        </section>

        <aside className="publish-panel" aria-label="发布配置">
          <div className="panel-block">
            <div className="panel-heading">
              <Space size={10}>
                <Settings aria-hidden="true" size={18} strokeWidth={1.8} />
                <Typography.Text strong>平台配置</Typography.Text>
              </Space>
            </div>

            {selectedPlatformId === "wechat" ? <Form layout="vertical" size="middle">
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
            </Form> : (
              <Form layout="vertical" size="middle">
                <Alert
                  className="platform-note"
                  description="无需提供账号密码、Cookie 或 Token，登录和最终发布均在平台创作中心完成。"
                  showIcon
                  title={`${selectedPlatform.name}内容准备`}
                  type="info"
                />
                <Form.Item label="文章分类">
                  <Input
                    onChange={(event) => updateContentOption("category", event.target.value)}
                    placeholder="例如：前端"
                    value={contentOptions[selectedPlatformId].category}
                  />
                </Form.Item>
                <Form.Item label="标签">
                  <Input
                    onChange={(event) => updateContentOption("tags", event.target.value)}
                    placeholder="多个标签用逗号分隔"
                    value={contentOptions[selectedPlatformId].tags}
                  />
                </Form.Item>
                <Form.Item label="摘要">
                  <Input.TextArea
                    onChange={(event) => updateContentOption("summary", event.target.value)}
                    placeholder="用于平台发布页的文章摘要"
                    rows={3}
                    value={contentOptions[selectedPlatformId].summary}
                  />
                </Form.Item>
              </Form>
            )}
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
              {selectedPlatformId === "wechat" && (
                <Button
                  block
                  disabled={isPublishing}
                  icon={<Send aria-hidden="true" size={16} />}
                  loading={isPublishing}
                  onClick={() => void handleSimulatePublish()}
                  type="primary"
                >
                  模拟发布
                </Button>
              )}
              {selectedPlatformId !== "wechat" && (
                <>
                  <div className="copy-action-grid">
                    <Button
                      icon={<Copy aria-hidden="true" size={15} />}
                      loading={activeQuickAction === "copy-title"}
                      onClick={() => void handleCopyContent("title")}
                    >
                      复制标题
                    </Button>
                    <Button
                      icon={<Copy aria-hidden="true" size={15} />}
                      loading={activeQuickAction === "copy-body"}
                      onClick={() => void handleCopyContent("body")}
                    >
                      复制正文
                    </Button>
                  </div>
                  <Button
                    block
                    icon={<Copy aria-hidden="true" size={16} />}
                    loading={activeQuickAction === "copy-all"}
                    onClick={() => void handleCopyContent("all")}
                  >
                    复制标题和正文
                  </Button>
                  <Button
                    block
                    icon={<ExternalLink aria-hidden="true" size={16} />}
                    loading={activeQuickAction === "open-publisher"}
                    onClick={() => void handleOpenPublisher()}
                    type="primary"
                  >
                    打开{selectedPlatform.name}创作中心
                  </Button>
                </>
              )}
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
              <Empty className="empty-history" description="暂无发布记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
