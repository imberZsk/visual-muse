import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// 根节点元素，保存 React 应用挂载目标。
const rootElement = document.getElementById('root')

// 业务场景：HTML 模板异常时直接抛错，避免静默渲染空白页。
if (!rootElement) {
  throw new Error('缺少 React 挂载节点')
}

// React 根实例，保存整个渲染进程的组件树入口。
const root = createRoot(rootElement)

root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
