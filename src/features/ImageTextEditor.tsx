import {
  Button,
  Input,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  BatteryMedium,
  ChevronLeft,
  Download,
  MoreHorizontal,
  Signal,
  Wifi,
} from 'lucide-react'
import { marked } from 'marked'
import { useMemo, useState } from 'react'
import {
  createStudioId,
  splitMarkdownCards,
  type CardSplitMode,
  type StudioState,
} from '../domain/studio'
import { StudioHeader } from './StudioHeader'

/** 图文卡片预设尺寸。 */
const cardSizeOptions = [
  { label: '小红书 3:4', value: '3/4' },
  { label: '方形 1:1', value: '1/1' },
  { label: '朋友圈 4:5', value: '4/5' },
]

/** 图文编辑器参数。 */
interface ImageTextEditorProps {
  /** 当前工作区状态。 */
  state: StudioState
  /** 更新完整工作区状态。 */
  setState: React.Dispatch<React.SetStateAction<StudioState | null>>
  /** Ant Design 消息 API。 */
  messageApi: ReturnType<typeof message.useMessage>[0]
}

/**
 * 图文编辑器；支持拆卡、主题排版、手机预览和 PNG 导出。
 */
export function ImageTextEditor({
  state,
  setState,
  messageApi,
}: ImageTextEditorProps) {
  // 当前文稿，保存图文编辑器使用的 Markdown 来源。
  const activeDocument =
    state.documents.find(
      (document) => document.id === state.activeDocumentId
    ) ?? state.documents[0]
  // 图文正文，保存拆卡编辑内容。
  const [content, setContent] = useState(activeDocument?.content ?? '')
  // 卡片比例，保存预览画布的尺寸预设。
  const [cardRatio, setCardRatio] = useState('3/4')
  // 预览缩放，保存卡片画布显示百分比。
  const [previewScale, setPreviewScale] = useState(80)
  // 字体族，保存图文卡片的排版字体预设。
  const [fontFamily, setFontFamily] = useState('system-ui')
  // 字号倍率，保存卡片正文相对基础字号的缩放值。
  const [fontScale, setFontScale] = useState(100)
  // 卡片高度模式，保存固定裁切或内容自适应状态。
  const [adaptiveHeight, setAdaptiveHeight] = useState(false)
  // 阴影开关，保存卡片导出预览是否使用投影。
  const [shadowEnabled, setShadowEnabled] = useState(true)
  // 小红书预览模式，保存笔记详情或封面流展示壳。
  const [xiaohongshuPreview, setXiaohongshuPreview] = useState<'note' | 'feed'>(
    'note'
  )
  // 图文卡片，保存按当前模式拆分后的 Markdown 数组。
  const cards = useMemo(
    () => splitMarkdownCards(content, state.cardSplitMode),
    [content, state.cardSplitMode]
  )
  // 当前图文主题，保存预览使用的颜色配置。
  const currentTheme =
    state.themes.find((theme) => theme.id === state.defaultImageThemeId) ??
    state.themes.find((theme) => theme.kind === 'image-text')

  /** 导出全部图文卡片到本地目录。 */
  const handleExport = async (): Promise<void> => {
    if (!window.visualMuseWorkspace?.exportCards) {
      messageApi.warning('桌面应用中才能导出 PNG')
      return
    }
    // 导出结果，保存主进程写入文件的数量和目录。
    const result = await window.visualMuseWorkspace.exportCards(
      cards,
      currentTheme
    )
    // 导出时间，保存卡片素材归档的统一时间戳。
    const exportedAt = new Date().toLocaleString()
    setState((current) =>
      current
        ? {
            ...current,
            assets: [
              ...current.assets,
              ...cards.map((_, index) => ({
                id: createStudioId('asset'),
                name: `图文卡片 ${index + 1} · ${exportedAt}`,
                kind: 'card' as const,
                value: `${result.directory}/card-${String(index + 1).padStart(2, '0')}.png`,
                platformId: 'xiaohongshu',
                accountId: null,
              })),
            ],
          }
        : current
    )
    messageApi.success(`已导出 ${result.count} 张卡片到 ${result.directory}`)
  }

  return (
    <>
      <StudioHeader
        title="图文编辑"
        description="Markdown 分卡、机型预览和批量导出"
        actions={
          <Button
            type="primary"
            icon={<Download size={16} />}
            onClick={() => void handleExport()}
          >
            导出 PNG
          </Button>
        }
      />
      <div className="studio-toolbar">
        <Segmented
          value={state.cardSplitMode}
          options={[
            { label: '单卡', value: 'single' },
            { label: '自动分卡', value: 'automatic' },
            { label: '--- 手动分卡', value: 'manual' },
          ]}
          onChange={(value) =>
            setState((current) =>
              current
                ? { ...current, cardSplitMode: value as CardSplitMode }
                : current
            )
          }
        />
        <Select
          aria-label="卡片尺寸"
          value={cardRatio}
          options={cardSizeOptions}
          onChange={setCardRatio}
        />
        <Select
          aria-label="图文主题"
          value={currentTheme?.id}
          options={state.themes
            .filter((theme) => theme.kind === 'image-text')
            .map((theme) => ({ label: theme.name, value: theme.id }))}
          onChange={(value) =>
            setState((current) =>
              current ? { ...current, defaultImageThemeId: value } : current
            )
          }
        />
        <Select
          aria-label="卡片字体"
          value={fontFamily}
          options={[
            { label: '系统字体', value: 'system-ui' },
            { label: '宋体', value: 'serif' },
            { label: '等宽字体', value: 'monospace' },
          ]}
          onChange={setFontFamily}
        />
        <Space>
          <Typography.Text type="secondary">字号</Typography.Text>
          <Input
            type="range"
            min={80}
            max={130}
            value={fontScale}
            onChange={(event) => setFontScale(Number(event.target.value))}
          />
        </Space>
        <Space>
          <Typography.Text type="secondary">缩放</Typography.Text>
          <Input
            type="range"
            min={45}
            max={100}
            value={previewScale}
            onChange={(event) => setPreviewScale(Number(event.target.value))}
          />
        </Space>
        <Space>
          <Typography.Text type="secondary">高度自适应</Typography.Text>
          <Switch checked={adaptiveHeight} onChange={setAdaptiveHeight} />
        </Space>
        <Space>
          <Typography.Text type="secondary">阴影</Typography.Text>
          <Switch checked={shadowEnabled} onChange={setShadowEnabled} />
        </Space>
        <Segmented
          aria-label="小红书预览模式"
          value={xiaohongshuPreview}
          options={[
            { label: '笔记页', value: 'note' },
            { label: '封面流', value: 'feed' },
          ]}
          onChange={(value) => setXiaohongshuPreview(value as 'note' | 'feed')}
        />
      </div>
      <div className="editor-preview-grid studio-editor-grid">
        <section className="editor-surface">
          <div className="panel-heading">
            <Typography.Text strong>Markdown</Typography.Text>
            <Typography.Text type="secondary">
              {cards.length} 张
            </Typography.Text>
          </div>
          <Input.TextArea
            aria-label="图文 Markdown 编辑器"
            className="markdown-editor"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </section>
        <section className="card-preview-scroll" aria-label="图文卡片预览">
          <div
            className={`phone-preview-shell xhs-preview-${xiaohongshuPreview}`}
            aria-label="手机预览"
          >
            <div className="phone-status-bar" aria-hidden="true">
              <span>9:41</span>
              <span className="phone-status-icons">
                <Signal size={13} />
                <Wifi size={13} />
                <BatteryMedium size={15} />
              </span>
            </div>
            <div className="phone-preview-header">
              <ChevronLeft size={20} aria-hidden="true" />
              <strong>
                {xiaohongshuPreview === 'note' ? '笔记预览' : '发现'}
              </strong>
              <MoreHorizontal size={20} aria-hidden="true" />
            </div>
            <div className="phone-preview-viewport">
              <div
                className={xiaohongshuPreview === 'feed' ? 'xhs-feed-grid' : ''}
              >
                {cards.map((card, index) => (
                  <article
                    className={`image-card${adaptiveHeight ? ' adaptive-height' : ''}${shadowEnabled ? '' : ' no-shadow'}`}
                    key={`${index}-${card.slice(0, 12)}`}
                    style={{
                      aspectRatio: adaptiveHeight ? 'auto' : cardRatio,
                      background: currentTheme?.background,
                      color: currentTheme?.foreground,
                      borderColor: currentTheme?.accent,
                      transform: `scale(${previewScale / 100})`,
                      transformOrigin: 'top center',
                      fontFamily,
                      fontSize: `${fontScale}%`,
                    }}
                  >
                    <Tag color={currentTheme?.accent}>CARD {index + 1}</Tag>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(card) as string,
                      }}
                    />
                  </article>
                ))}
              </div>
            </div>
            <div className="phone-home-area" aria-hidden="true">
              <span />
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
