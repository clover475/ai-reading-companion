# AI Reading Companion Browser Extension

Chrome 插件 MVP：在网页、微信读书、博客、课程页面中读取用户主动选中的文字，调用 OpenAI-compatible API 做陪读，并生成可复制到 Obsidian 的 Markdown 阅读卡片。

## MVP 功能

- 浏览器侧边栏 UI
- 读取当前网页选中文本
- 记录网页标题、来源站点、URL、捕获时间
- 支持手动粘贴/编辑选中文本
- 支持手动补充或修正网页标题和 URL
- 自由提问和快捷按钮：
  - 解释这段
  - 讲简单一点
  - 我读不进去了
  - 回应我的想法
  - 生成阅读卡片
- 阅读卡片包含来源信息，适合复制回 Obsidian
- 本地保存最近 20 张阅读卡片
- 支持复制 Markdown 和下载 `.md`
- API Key / Base URL / Model 本地配置，不写死在代码里

## 安装测试

1. 打开 Chrome：`chrome://extensions/`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录：`browser-extension/`
5. 打开任意网页，选中一段文字
6. 点击扩展图标，打开侧边栏
7. 在「API 设置」里填写 API Key、Base URL 和 Model
8. 如果自动捕获失败，可以把选中文本直接粘贴到「当前选中文本 / 可粘贴」
9. 确认标题和 URL 正确，点击「生成阅读卡片」
10. 点击「复制 Markdown」，回 Obsidian 粘贴

## 阅读卡片格式

```markdown
# 今日陪读卡片

## 阅读来源
- 标题：
- 来源：
- URL：
- 时间：

## 我读到的位置

## 我划线的内容

## 我关注的重点

## 我今天理解到

## 我还没理解

## AI 给我的一句提醒
```
