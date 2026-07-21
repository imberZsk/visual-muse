import { describe, expect, test } from "vitest";
import {
  buildWechatDraftPayload,
  parseArticleMarkdown,
  publishingPlatforms,
  simulatePublish,
  validatePublishTarget,
} from "./publisher";

describe("文章发布领域模型", () => {
  test("包含参考项目里的主要发布平台", () => {
    expect(publishingPlatforms.map((platform) => platform.id)).toEqual([
      "wechat",
      "zhihu",
      "toutiao",
      "juejin",
      "csdn",
      "medium",
    ]);
  });

  test("解析 Markdown frontmatter 并保留正文", () => {
    // 示例 Markdown 内容，用来覆盖公众号常用元数据。
    const markdown = `---\ntitle: 深色工作台发布指南\ncover: ./cover.png\nauthor: Visual Muse\nsource_url: https://example.com\nneed_open_comment: true\n---\n\n# 正文标题\n\n这里是正文。`;

    expect(parseArticleMarkdown(markdown)).toMatchObject({
      metadata: {
        title: "深色工作台发布指南",
        cover: "./cover.png",
        author: "Visual Muse",
        source_url: "https://example.com",
        need_open_comment: true,
      },
      body: "# 正文标题\n\n这里是正文。",
    });
  });

  test("为公众号普通图文生成草稿载荷", () => {
    // 普通图文文章解析结果，用来生成微信公众号 draft/add 载荷。
    const article = parseArticleMarkdown(`---\ntitle: 普通图文\nauthor: Muse\ncover: ./cover.png\n---\n\n# Hello`);

    expect(buildWechatDraftPayload(article)).toMatchObject({
      kind: "article",
      articles: [
        {
          title: "普通图文",
          author: "Muse",
          cover: "./cover.png",
          content: expect.stringContaining("<h1>Hello</h1>"),
        },
      ],
    });
  });

  test("为公众号图片消息自动提取正文图片", () => {
    // 图片消息 Markdown 内容，用来覆盖小绿书发布场景。
    const markdown = `---\ntitle: 图片消息\ntype: image\n---\n\n![](./1.jpeg)\n![](https://example.com/2.jpeg)\n\n补充描述`;
    // 图片消息文章解析结果，用来构造 image_list。
    const article = parseArticleMarkdown(markdown);

    expect(buildWechatDraftPayload(article)).toMatchObject({
      kind: "image",
      title: "图片消息",
      image_list: ["./1.jpeg", "https://example.com/2.jpeg"],
      content: "补充描述",
    });
  });

  test("发布预检会提示缺失标题", () => {
    // 缺失标题的文章解析结果，用来验证发布前错误提示。
    const article = parseArticleMarkdown("# 没有 frontmatter 标题");

    expect(validatePublishTarget(publishingPlatforms[0], article)).toMatchObject({
      ok: false,
      errors: ["缺少文章标题"],
    });
  });

  test("模拟发布返回平台、标题和 mediaId", () => {
    // 可发布文章解析结果，用来生成模拟发布记录。
    const article = parseArticleMarkdown(`---\ntitle: 可发布文章\n---\n\n# Hello`);

    expect(simulatePublish(publishingPlatforms[0], article)).toMatchObject({
      platformId: "wechat",
      title: "可发布文章",
      status: "success",
      mediaId: expect.stringMatching(/^mock_wechat_/),
    });
  });
});
