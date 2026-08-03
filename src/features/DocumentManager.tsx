import {
  Button,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Tooltip,
  Tree,
  Typography,
  message,
} from 'antd'
import {
  ArrowDown,
  ArrowUp,
  Download,
  FilePlus2,
  FolderPlus,
  History,
  Import,
  Link,
  PanelLeft,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createDefaultStudioState,
  createStudioId,
  maximumDocumentVersionCount,
  normalizeStudioState,
  type StudioDocument,
  type StudioState,
} from '../domain/studio'

/** 内容管理器参数。 */
interface DocumentManagerProps {
  /** 当前编辑器 Markdown。 */
  markdown: string
  /** 当前解析出的文章标题。 */
  title: string
  /** 载入文稿；`content` 是 Markdown 正文。 */
  onLoadDocument: (content: string) => void
}

/**
 * 读取文章工作区；`markdown` 是首次启动的默认正文。
 */
async function loadWorkspace(markdown: string): Promise<StudioState> {
  // 桌面工作区，保存主进程从独立 JSON 文件读取的状态。
  const desktopState = await window.visualMuseWorkspace?.getState()
  if (desktopState) return normalizeStudioState(desktopState, markdown)
  // Web 降级原文，保存 localStorage 中的功能工作区 JSON。
  const rawState = window.localStorage.getItem('visual-muse-studio')
  if (rawState) {
    try {
      return normalizeStudioState(JSON.parse(rawState) as unknown, markdown)
    } catch {
      // 业务场景：损坏状态必须降级默认工作区，不能阻断文章编辑。
    }
  }
  return createDefaultStudioState(markdown)
}

/**
 * 保存文章工作区；`state` 是文稿树和其它功能数据的完整状态。
 */
async function saveWorkspace(state: StudioState): Promise<void> {
  if (window.visualMuseWorkspace) {
    await window.visualMuseWorkspace.setState(state)
    return
  }
  window.localStorage.setItem('visual-muse-studio', JSON.stringify(state))
}

/**
 * 文章内容管理器；支持文稿树、文件夹、排序、版本、导入导出和目录同步。
 */
export default function DocumentManager({
  markdown,
  title,
  onLoadDocument,
}: DocumentManagerProps) {
  // 消息 API，保存文稿操作反馈。
  const [messageApi, messageContextHolder] = message.useMessage()
  // 抽屉状态，保存内容管理侧栏是否展开。
  const [isOpen, setIsOpen] = useState(false)
  // 工作区状态，保存文稿、文件夹和历史版本。
  const [workspace, setWorkspace] = useState<StudioState | null>(null)
  // 初始化状态，保存工作区是否已完成读取。
  const [isHydrated, setIsHydrated] = useState(false)
  // URL 导入弹窗状态，保存正文抓取表单是否展开。
  const [isImportingUrl, setIsImportingUrl] = useState(false)
  // 待导入 URL，保存用户输入的 HTTPS 文章地址。
  const [importUrl, setImportUrl] = useState('')
  // 历史文稿标识，保存当前弹窗查看的文稿 ID，并从最新工作区派生版本。
  const [historyDocumentId, setHistoryDocumentId] = useState<string | null>(
    null
  )
  // 初始 Markdown 引用，保存组件首次挂载时用于工作区初始化的正文。
  const initialMarkdownRef = useRef(markdown)
  // 文稿载入回调引用，避免父组件每次渲染重新触发工作区读取。
  const onLoadDocumentRef = useRef(onLoadDocument)

  useEffect(() => {
    // 组件挂载标记，避免异步读取完成后更新已卸载组件。
    let isMounted = true
    void loadWorkspace(initialMarkdownRef.current).then((state) => {
      if (!isMounted) return
      setWorkspace(state)
      // 活动文稿，保存工作区恢复后需要载入编辑器的正文。
      const activeDocument = state.documents.find(
        (document) => document.id === state.activeDocumentId
      )
      if (activeDocument) onLoadDocumentRef.current(activeDocument.content)
      setIsHydrated(true)
    })
    /** 清理工作区加载副作用。 */
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) return undefined
    // 自动保存定时器，保存当前文稿正文并合并连续输入。
    const saveTimer = window.setTimeout(() => {
      setWorkspace((current) => {
        if (!current) return current
        // 更新时间，保存正文自动落盘的时间戳。
        const updatedAt = new Date().toISOString()
        // 下一工作区，保存活动文稿最新正文和标题。
        const nextWorkspace: StudioState = {
          ...current,
          documents: current.documents.map((document) =>
            document.id === current.activeDocumentId
              ? {
                  ...document,
                  title: title.trim() || document.title,
                  content: markdown,
                  updatedAt,
                }
              : document
          ),
        }
        void saveWorkspace(nextWorkspace)
        return nextWorkspace
      })
    }, 500)
    /** 清理尚未执行的自动保存。 */
    return () => window.clearTimeout(saveTimer)
  }, [isHydrated, markdown, title])

  // 文稿树数据，保存按文件夹分组的 Ant Design Tree 节点。
  const treeData = useMemo(() => {
    if (!workspace) return []
    // 根目录文稿，保存没有文件夹归属的文稿节点。
    const rootDocuments = workspace.documents
      .filter((document) => document.folderId === null)
      .map((document) => ({
        key: `document:${document.id}`,
        title: document.title,
        isLeaf: true,
      }))
    // 文件夹节点，保存各目录及其文稿子节点。
    const folderNodes = workspace.folders.map((folder) => ({
      key: `folder:${folder.id}`,
      title: folder.name,
      children: workspace.documents
        .filter((document) => document.folderId === folder.id)
        .map((document) => ({
          key: `document:${document.id}`,
          title: document.title,
          isLeaf: true,
        })),
    }))
    return [...folderNodes, ...rootDocuments]
  }, [workspace])
  // 历史文稿，保存从最新工作区状态找到的版本来源，避免保存后立即打开读取旧快照。
  const historyDocument =
    workspace?.documents.find(
      (document) => document.id === historyDocumentId
    ) ?? null

  /** 更新并保存工作区；`updater` 接收当前状态并返回下一状态。 */
  const updateWorkspace = (
    updater: (current: StudioState) => StudioState
  ): void => {
    setWorkspace((current) => {
      if (!current) return current
      // 下一工作区，保存用户操作后的完整状态。
      const nextState = updater(current)
      void saveWorkspace(nextState)
      return nextState
    })
  }

  /** 新建文稿。 */
  const createDocument = (): void => {
    // 创建时间，保存新文稿首次更新时间。
    const createdAt = new Date().toISOString()
    // 新文稿，保存根目录下的空白 Markdown。
    const document: StudioDocument = {
      id: createStudioId('document'),
      title: '未命名文章',
      folderId: null,
      content: '---\ntitle: 未命名文章\n---\n\n',
      updatedAt: createdAt,
      versions: [],
    }
    updateWorkspace((current) => ({
      ...current,
      activeDocumentId: document.id,
      documents: [...current.documents, document],
    }))
    onLoadDocument(document.content)
  }

  /** 新建文件夹。 */
  const createFolder = (): void => {
    // 文件夹名称，保存用户确认的目录标题。
    const name = window.prompt('文件夹名称')?.trim()
    if (!name) return
    updateWorkspace((current) => ({
      ...current,
      folders: [...current.folders, { id: createStudioId('folder'), name }],
    }))
  }

  /** 选择树节点；`keys` 是 Ant Design 返回的节点键数组。 */
  const selectTreeNode = (keys: React.Key[]): void => {
    // 节点键，保存当前选择的第一个文稿节点。
    const key = String(keys[0] ?? '')
    if (!key.startsWith('document:') || !workspace) return
    // 文稿标识，保存去掉节点类型前缀后的 ID。
    const documentId = key.slice('document:'.length)
    // 目标文稿，保存要载入编辑器的文稿对象。
    const document = workspace.documents.find((item) => item.id === documentId)
    if (!document) return
    updateWorkspace((current) => ({ ...current, activeDocumentId: documentId }))
    onLoadDocument(document.content)
  }

  /** 保存活动文稿历史版本。 */
  const saveVersion = (): void => {
    if (!workspace) return
    // 版本时间，保存历史快照创建时刻。
    const createdAt = new Date().toISOString()
    updateWorkspace((current) => ({
      ...current,
      documents: current.documents.map((document) =>
        document.id === current.activeDocumentId
          ? {
              ...document,
              versions: [
                { id: createStudioId('version'), content: markdown, createdAt },
                ...document.versions,
              ].slice(0, maximumDocumentVersionCount),
            }
          : document
      ),
    }))
    messageApi.success('已保存历史版本')
  }

  /** 删除活动文稿。 */
  const deleteDocument = (): void => {
    if (!workspace || workspace.documents.length <= 1) {
      messageApi.warning('至少保留一篇文稿')
      return
    }
    // 删除后的文稿列表，保存移除活动文稿后的结果。
    const remainingDocuments = workspace.documents.filter(
      (document) => document.id !== workspace.activeDocumentId
    )
    // 下一活动文稿，保存删除后自动打开的第一篇文章。
    const nextDocument = remainingDocuments[0]
    updateWorkspace((current) => ({
      ...current,
      activeDocumentId: nextDocument.id,
      documents: remainingDocuments,
    }))
    onLoadDocument(nextDocument.content)
  }

  /** 调整活动文稿顺序；`direction` 表示向上或向下移动。 */
  const moveDocument = (direction: -1 | 1): void => {
    if (!workspace) return
    // 当前索引，保存活动文稿在列表中的位置。
    const currentIndex = workspace.documents.findIndex(
      (document) => document.id === workspace.activeDocumentId
    )
    // 目标索引，保存应用边界限制后的移动位置。
    const targetIndex = currentIndex + direction
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= workspace.documents.length
    )
      return
    // 排序后的文稿，保存交换位置后的列表。
    const documents = [...workspace.documents]
    ;[documents[currentIndex], documents[targetIndex]] = [
      documents[targetIndex],
      documents[currentIndex],
    ]
    updateWorkspace((current) => ({ ...current, documents }))
  }

  /** 从 URL 导入正文。 */
  const importFromUrl = async (): Promise<void> => {
    if (!importUrl.trim() || !window.visualMuseWorkspace?.importArticleUrl)
      return
    // 导入结果，保存主进程从页面可读 DOM 提取的标题和 Markdown。
    const article = await window.visualMuseWorkspace.importArticleUrl(
      importUrl.trim()
    )
    // 新文稿，保存 URL 正文抓取结果。
    const document: StudioDocument = {
      id: createStudioId('document'),
      title: article.title,
      folderId: null,
      content: article.markdown,
      updatedAt: new Date().toISOString(),
      versions: [],
    }
    updateWorkspace((current) => ({
      ...current,
      activeDocumentId: document.id,
      documents: [...current.documents, document],
    }))
    onLoadDocument(document.content)
    setIsImportingUrl(false)
    setImportUrl('')
  }

  /** 绑定本地目录并同步 Markdown。 */
  const bindAndSyncFolder = async (): Promise<void> => {
    if (!window.visualMuseWorkspace) return
    // 绑定目录，保存用户在系统选择器中明确授权的路径。
    const directory =
      workspace?.boundFolderPath ??
      (await window.visualMuseWorkspace.bindContentFolder())
    if (!directory) return
    // 同步结果，保存主进程读取或写入后的 Markdown 文稿。
    const syncedDocuments = await window.visualMuseWorkspace.syncContentFolder(
      workspace?.documents ?? []
    )
    updateWorkspace((current) => ({
      ...current,
      boundFolderPath: directory,
      documents:
        syncedDocuments.length > 0 ? syncedDocuments : current.documents,
      activeDocumentId: syncedDocuments.some(
        (document) => document.id === current.activeDocumentId
      )
        ? current.activeDocumentId
        : (syncedDocuments[0]?.id ?? current.activeDocumentId),
    }))
    messageApi.success(`已同步 ${syncedDocuments.length} 篇文稿`)
  }

  return (
    <>
      {messageContextHolder}
      <Tooltip title="内容管理">
        <Button
          aria-label="打开内容管理"
          icon={<PanelLeft size={16} />}
          onClick={() => setIsOpen(true)}
        />
      </Tooltip>
      <Drawer
        title="内容管理"
        placement="left"
        size="default"
        open={isOpen}
        onClose={() => setIsOpen(false)}
        extra={
          <Space>
            <Button
              aria-label="新建文稿"
              icon={<FilePlus2 size={16} />}
              onClick={createDocument}
            />
            <Button
              aria-label="新建文件夹"
              icon={<FolderPlus size={16} />}
              onClick={createFolder}
            />
          </Space>
        }
      >
        <Space wrap className="document-toolbar">
          <Button icon={<Save size={16} />} onClick={saveVersion}>
            保存版本
          </Button>
          <Button
            icon={<History size={16} />}
            onClick={() =>
              setHistoryDocumentId(workspace?.activeDocumentId ?? null)
            }
          >
            历史
          </Button>
          <Button
            icon={<ArrowUp size={16} />}
            aria-label="文稿上移"
            onClick={() => moveDocument(-1)}
          />
          <Button
            icon={<ArrowDown size={16} />}
            aria-label="文稿下移"
            onClick={() => moveDocument(1)}
          />
          <Button danger icon={<Trash2 size={16} />} onClick={deleteDocument}>
            删除
          </Button>
        </Space>
        {treeData.length > 0 ? (
          <Tree
            blockNode
            defaultExpandAll
            selectedKeys={
              workspace ? [`document:${workspace.activeDocumentId}`] : []
            }
            treeData={treeData}
            onSelect={selectTreeNode}
          />
        ) : (
          <Empty description="暂无文稿" />
        )}
        <Typography.Title level={5}>导入与同步</Typography.Title>
        <Space wrap>
          <Button
            icon={<Link size={16} />}
            onClick={() => setIsImportingUrl(true)}
          >
            链接导入
          </Button>
          <Button
            icon={<Import size={16} />}
            onClick={async () => {
              const article = await window.visualMuseWorkspace?.importMarkdown()
              if (article) {
                const document: StudioDocument = {
                  id: createStudioId('document'),
                  title: article.title,
                  folderId: null,
                  content: article.markdown,
                  updatedAt: new Date().toISOString(),
                  versions: [],
                }
                updateWorkspace((current) => ({
                  ...current,
                  activeDocumentId: document.id,
                  documents: [...current.documents, document],
                }))
                onLoadDocument(document.content)
              }
            }}
          >
            导入 MD
          </Button>
          <Button
            icon={<RefreshCw size={16} />}
            onClick={() => void bindAndSyncFolder()}
          >
            {workspace?.boundFolderPath ? '同步目录' : '绑定目录'}
          </Button>
        </Space>
        <Typography.Title level={5}>导出</Typography.Title>
        <Space wrap>
          {(['md', 'html', 'pure-html', 'pdf'] as const).map((format) => (
            <Button
              key={format}
              icon={<Download size={16} />}
              onClick={() =>
                void window.visualMuseWorkspace?.exportArticle({
                  title,
                  markdown,
                  format,
                })
              }
            >
              {format.toUpperCase()}
            </Button>
          ))}
        </Space>
      </Drawer>
      <Modal
        title="链接导入"
        open={isImportingUrl}
        onCancel={() => setIsImportingUrl(false)}
        onOk={() => void importFromUrl()}
      >
        <Input
          aria-label="文章链接"
          placeholder="https://..."
          value={importUrl}
          onChange={(event) => setImportUrl(event.target.value)}
        />
      </Modal>
      <Modal
        title="历史版本"
        open={Boolean(historyDocumentId)}
        footer={null}
        onCancel={() => setHistoryDocumentId(null)}
      >
        <List
          dataSource={historyDocument?.versions ?? []}
          locale={{ emptyText: '尚未保存历史版本' }}
          renderItem={(version) => (
            <List.Item
              actions={[
                <Button
                  key="restore"
                  onClick={() => {
                    onLoadDocument(version.content)
                    setHistoryDocumentId(null)
                  }}
                >
                  恢复
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={new Date(version.createdAt).toLocaleString()}
                description={`${version.content.length} 字符`}
              />
            </List.Item>
          )}
        />
      </Modal>
    </>
  )
}
