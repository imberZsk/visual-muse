import { Typography } from 'antd'

/** 页面标题参数。 */
interface StudioHeaderProps {
  /** 页面标题。 */
  title: string
  /** 页面说明。 */
  description: string
  /** 标题右侧操作。 */
  actions?: React.ReactNode
}

/**
 * 渲染功能页面标题；参数用于显示标题、说明和可选操作。
 */
export function StudioHeader({
  title,
  description,
  actions,
}: StudioHeaderProps) {
  return (
    <header className="studio-header">
      <div>
        <Typography.Title level={2}>{title}</Typography.Title>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
      {actions}
    </header>
  )
}
