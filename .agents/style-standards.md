# 样式规范

## 样式归属

- `src/styles.css` 当前只服务 `App.tsx` 的工作台外壳和主题语义变量；后续抽出独立组件时，其专用样式必须迁移到相邻 `ComponentName.css`，不得继续堆入无边界全局样式。
- 选择器必须绑定 `.app-shell` 或明确业务根 class；覆盖 Ant Design 内部 DOM 时限定组件根 class，禁止全局修改所有同类组件。
- 侧栏宽度、字体层级、图标尺寸、控件高度和响应式断点属于设计基础，必须遵循 `ui-standards.md`，页面不得复制另一套数值。

## JSX 行内样式边界

- 业务组件默认禁止 `style={{ ... }}`、`styles={{ ... }}` 和通过 `*Props` 传入固定 style。固定布局、尺寸、间距、字号、颜色、背景、边框、圆角、阴影和滚动规则必须进入相邻 CSS。
- Ant Design 的 `block`、`danger`、`type`、`size`、`status`、`Typography type` 和语义 `Tag color` 属于组件 API，可以使用。
- 唯一例外是运行时才能确定且无法由 class/CSS 自定义属性表达的数据驱动几何值；必须注释数据来源和不能使用 CSS 的原因，不得夹带固定视觉值。

## 颜色与覆盖

- Ant Design 运行时颜色集中在 `App.tsx` 主题 token，CSS 使用 `styles.css` 的语义变量；业务区域不得散落裸色值。
- 深浅主题都必须保持正文、弱化文本、边界、主操作和语义状态可读，不为单一主题增加临时补丁。
- 不把 `!important` 作为默认方案；长标题、路径和标签使用 `min-width: 0`、换行、省略或 Tooltip，不挤出主要操作。

## 完成前检查

1. 搜索 `style=`、`styles=`、裸色值和规范外间距，确认专用规则已绑定业务根 class。
2. 运行格式检查、完整测试、类型检查、构建和隐藏 Electron E2E。
3. 生成默认平台、内容平台、明暗主题与最小窗口截图，并逐张按 `ui-standards.md` 验收。
