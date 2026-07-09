import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import App from "./App";

describe("Visual Muse 工作台", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("默认使用深色主题并展示参考平台", () => {
    render(<App />);

    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: /微信公众号/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /知乎/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今日头条/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Medium/ })).toBeInTheDocument();
  });

  test("可以切换浅色主题", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("switch", { name: "主题切换" }));

    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-theme", "light");
  });

  test("切换平台后展示对应发布能力", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /知乎/ }));

    expect(screen.getByText(/适配知乎编辑器/)).toBeInTheDocument();
  });

  test("缺少标题时预检展示错误", () => {
    render(<App />);

    // Markdown 输入框，用来模拟用户粘贴一篇缺少 frontmatter 标题的文章。
    const editor = screen.getByLabelText("Markdown 编辑器");
    fireEvent.change(editor, { target: { value: "# 没有标题\n\n正文" } });
    fireEvent.click(screen.getByRole("button", { name: "发布预检" }));

    expect(screen.getByText("缺少文章标题")).toBeInTheDocument();
  });

  test("模拟发布会生成成功记录", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "模拟发布" }));

    expect(screen.getByText("发布模拟成功")).toBeInTheDocument();
    expect(screen.getByText(/mock_wechat_/)).toBeInTheDocument();
  });
});
