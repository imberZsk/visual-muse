import { describe, expect, test } from 'vitest'
import {
  createDefaultStudioState,
  splitMarkdownCards,
  summarizeActivities,
} from './studio'

describe('内容工作台领域逻辑', () => {
  test('手动拆卡只按独立行分隔符拆分并移除空卡', () => {
    expect(
      splitMarkdownCards('第一张\n\n---\n\n第二张\n---\n\n', 'manual')
    ).toEqual(['第一张', '第二张'])
  })

  test('单卡模式保留完整 Markdown', () => {
    expect(splitMarkdownCards('# 标题\n\n正文', 'single')).toEqual([
      '# 标题\n\n正文',
    ])
  })

  test('自动拆卡保持段落完整并限制单卡长度', () => {
    // 长段落，保存自动拆卡长度边界两侧的内容。
    const paragraph = '一'.repeat(120)
    // 卡片列表，保存三个段落自动组合后的结果。
    const cards = splitMarkdownCards(
      `${paragraph}\n\n${paragraph}\n\n短段落`,
      'automatic'
    )
    expect(cards).toHaveLength(2)
    expect(cards[0]).toBe(paragraph)
    expect(cards[1]).toContain('短段落')
  })

  test('默认工作区包含文章要求的主题和 Skill 数量', () => {
    // 默认工作区，保存首次启动生成的完整创作数据。
    const state = createDefaultStudioState('# 默认文章')
    expect(
      state.themes.filter((theme) => theme.kind === 'article')
    ).toHaveLength(8)
    expect(
      state.themes.filter((theme) => theme.kind === 'image-text')
    ).toHaveLength(37)
    expect(state.skills).toHaveLength(17)
    expect(state.documents).toHaveLength(1)
  })

  test('发布统计按时间范围和状态汇总', () => {
    // 当前时间，保存最近记录的统一时间基准。
    const now = new Date().toISOString()
    // 过期时间，保存 40 天前不应进入 30 天统计的记录。
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    // 汇总结果，保存最近 30 天状态计数。
    const summary = summarizeActivities(
      [
        {
          id: '1',
          title: '成功',
          platformId: 'wechat',
          status: 'success',
          createdAt: now,
          message: '',
        },
        {
          id: '2',
          title: '草稿',
          platformId: 'zhihu',
          status: 'draft',
          createdAt: now,
          message: '',
        },
        {
          id: '3',
          title: '旧失败',
          platformId: 'weibo',
          status: 'failed',
          createdAt: old,
          message: '',
        },
      ],
      30
    )
    expect(summary).toEqual({ total: 2, success: 1, draft: 1, failed: 0 })
  })
})
