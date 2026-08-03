# 多平台文章分发产品调研

## 调研结论

直接跳转到平台只能减少一次找入口的动作。真正有价值的分发工具，需要把“一份内容”加工为“多个平台可继续发布的草稿”，并集中呈现每个平台的准备状态。

以下能力来自开源项目的一手 README，按对内容创作者的实际价值排序：

1. **一键批量分发**：一次选择多个平台并发起同一篇文章的分发任务，避免逐站复制。参考 [Wechatsync](https://github.com/wechatsync/Wechatsync) 和 [ArtiPub](https://github.com/crawlab-team/artipub)。
2. **平台独立内容变体**：同一源稿按平台生成标题、正文格式、摘要和元数据变体，例如掘金保留 Markdown、富文本平台使用 HTML。参考 [ArtiPub](https://github.com/crawlab-team/artipub) 和 [BrightBean Studio](https://github.com/brightbeanxyz/brightbean-studio)。
3. **草稿优先与人工确认**：自动化负责生成草稿，最终发布留在官方平台确认，降低误发风险。参考 [Wechatsync](https://github.com/wechatsync/Wechatsync)。
4. **复用本机登录态**：账号凭据和文章不经过第三方服务，直接使用本地已有的平台会话。参考 [Wechatsync](https://github.com/wechatsync/Wechatsync)。
5. **发布前状态矩阵**：集中检查平台登录状态、内容必填项和目标是否可用，不等到最后一步才发现失败。参考 [Wechatsync](https://github.com/wechatsync/Wechatsync) 的 `check_auth` 与 [ArtiPub](https://github.com/crawlab-team/artipub) 的工作流置信度和人工审查。
6. **图片自动转存**：把源文章图片上传到目标平台，避免外链失效和逐图操作。参考 [Wechatsync](https://github.com/wechatsync/Wechatsync) 与 [Doocs MD](https://github.com/doocs/md)。
7. **失败重试与任务审计**：每个平台独立记录结果，失败平台可单独重试，并保留可追踪的任务日志。参考 [ArtiPub](https://github.com/crawlab-team/artipub) 与 [BrightBean Studio](https://github.com/brightbeanxyz/brightbean-studio)。
8. **网页提取与素材导入**：从现有网页识别标题、正文和封面，再进入统一分发流程。参考 [Wechatsync](https://github.com/wechatsync/Wechatsync)。
9. **排版主题与富文本预览**：用主题、代码高亮和自定义样式保证公众号等富文本渠道的视觉质量。参考 [Doocs MD](https://github.com/doocs/md) 与 [Markdown Nice](https://github.com/mdnice/markdown-nice)。
10. **排期、版本和模板**：支持定时队列、平台覆盖版本、可复用模板和版本历史，适合长期内容运营。参考 [BrightBean Studio](https://github.com/brightbeanxyz/brightbean-studio)。

## 本次实现

本次优先落地不依赖外部服务、能在现有 Electron 架构中真实验收的六项能力：

- 三平台目标选择和一键批量准备；
- 小红书可读纯文本、掘金 Markdown、公众号富文本三种正文变体；
- 从首个正文段落自动生成平台摘要；
- 三平台格式、字数、摘要和预检状态矩阵；
- 真实任务状态、异常说明和单平台重试；
- 草稿优先、本地隔离持久会话与官方页面最终确认。

图片自动转存、网页提取、排期队列和版本模板需要新增素材存储或任务调度基础设施，留作后续版本，避免本次用不可验收的占位配置代替真实能力。
