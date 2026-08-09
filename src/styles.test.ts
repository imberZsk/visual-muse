import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/** readSource 读取项目源码，供样式边界静态回归测试复用。 */
function readSource(relativePath: string): string {
  return readFileSync(relativePath, 'utf8')
}

describe('Visual Muse 样式规范', () => {
  test('业务组件不使用固定行内样式', () => {
    // appSource 存储根工作台源码，用于阻止固定视觉规则回流 JSX。
    const appSource = readSource('src/App.tsx')

    expect(appSource).not.toMatch(/\bstyle\s*=/)
    expect(appSource).not.toMatch(/\bstyles\s*=/)
    expect(appSource).not.toContain('Public Sans')
  })

  test('侧栏、标题和图标遵循紧凑工作台尺寸', () => {
    // appSource 存储组件图标声明，用于防止普通工作台图标重新放大。
    const appSource = readSource('src/App.tsx')
    // styleSource 存储工作台布局尺寸，用于锁定左右栏和标题层级。
    const styleSource = readSource('src/styles.css')

    expect(styleSource).toContain(
      'grid-template-columns: 200px minmax(0, 1fr) 320px'
    )
    expect(styleSource).toMatch(
      /\.app-shell\s*\{[\s\S]*height: 100vh;[\s\S]*overflow: hidden;/
    )
    expect(appSource).not.toContain('className="brand-mark"')
    expect(styleSource).not.toContain('.brand-mark')
    expect(styleSource).toMatch(
      /\.platform-button\s*\{[\s\S]*min-height: 32px;/
    )
    expect(styleSource).toMatch(
      /\.workspace-header h2\s*\{[\s\S]*font-size: 20px;/
    )
    expect(styleSource).not.toContain('font-size: 30px')
    expect(appSource).not.toMatch(/size=\{(?:18|20)\}/)
    expect(appSource).toContain('controlHeight: 32')
  })

  test('全局与 Ant Design 使用统一系统字体', () => {
    // appSource 存储 Ant Design 主题字体配置。
    const appSource = readSource('src/App.tsx')
    // styleSource 存储浏览器根节点字体配置。
    const styleSource = readSource('src/styles.css')

    expect(appSource).toContain('fontFamily: appFontFamily')
    expect(styleSource).toContain("'PingFang SC'")
    expect(styleSource).toContain("'Microsoft YaHei'")
  })

  test('发布侧栏使用独立滚动区且工具区不会再次压缩裁切', () => {
    // appSource 存储发布侧栏结构，用于锁定真实滚动容器和固定操作区。
    const appSource = readSource('src/App.tsx')
    // styleSource 存储发布侧栏滚动与 flex 收缩修复规则。
    const styleSource = readSource('src/styles.css')

    expect(appSource).toContain('data-testid="publish-panel-scroll"')
    expect(styleSource).toMatch(
      /\.publish-panel\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto;[\s\S]*overflow: hidden;/
    )
    expect(styleSource).toMatch(
      /\.publish-panel-scroll\s*\{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;/
    )
    expect(styleSource).toMatch(
      /\.panel-block\s*\{[\s\S]*flex: 0 0 auto;[\s\S]*overflow: hidden;/
    )
  })

  test('颜色使用 Visual Worktree 的 Ant Design seed 和算法派生结果', () => {
    // appSource 存储主题入口，用于防止把亮色 hover 蓝重新当作暗色主色。
    const appSource = readSource('src/App.tsx')
    // styleSource 存储工作台语义色，确保业务 CSS 与 Ant Design token 对齐。
    const styleSource = readSource('src/styles.css')
    // indexHtml 存储 React 挂载前的启动颜色。
    const indexHtml = readSource('index.html')

    expect(appSource).toContain("colorPrimary: '#1677ff'")
    expect(appSource).not.toContain("themeMode === 'dark' ? '#4096ff'")
    expect(styleSource).toContain('--accent: #1668dc')
    expect(styleSource).toContain('--accent-soft: #15325b')
    expect(indexHtml).toContain('--startup-spinner-color: #1668dc')
  })
})
