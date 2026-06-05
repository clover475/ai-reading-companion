# AI Reading Companion / AI 陪读搭子

AI 陪读搭子产品仓库，当前包含两个 MVP：

- Obsidian 插件：在 Obsidian 里围绕当前资料和选中文本陪读，并把阅读卡片沉淀到笔记。
- Chrome 插件：在网页、微信读书、博客和课程页面里围绕选中文本陪读，生成可复制回 Obsidian 的 Markdown 阅读卡片。

两个端都优先兼容 OpenAI-compatible Chat Completions API。浏览器插件默认按 DeepSeek 配置：`https://api.deepseek.com` + `deepseek-chat`。API Key 只保存在本地配置里，不写死在代码中。

## 项目结构

```text
ai-reading-companion/
├── manifest.json
├── main.js
├── styles.css
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── browser-extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
└── src/
    ├── main.ts
    ├── settings.ts
    ├── view.ts
    └── api.ts
```

## Obsidian 插件测试

1. 把整个 `ai-reading-companion` 文件夹放到你的 Obsidian vault：`.obsidian/plugins/ai-reading-companion/`。
2. 打开 Obsidian 设置，进入「第三方插件」，关闭安全模式或启用社区插件。
3. 启用 `AI Reading Companion`。
4. 在插件设置里填写 API Key、Base URL 和 Model。
5. 打开任意 Markdown 笔记，选中一段文字。
6. 点击左侧 ribbon 图标或命令面板里的 `打开 AI 陪读搭子`。
7. 在右侧面板提问或点击快捷按钮。

## Chrome 插件测试

1. 打开 Chrome：`chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择 `browser-extension/` 文件夹。
5. 打开任意网页，选中一段文字。
6. 点击扩展图标打开侧边栏。
7. 在「API 设置」里填写 API Key、Base URL 和 Model。
8. 如果自动捕获失败，可以手动粘贴选中文本，并修正标题和 URL。
9. 先在陪读对话区进行多轮追问。
10. 结束阅读时生成阅读卡片，再复制 Markdown 回 Obsidian 粘贴。

## Obsidian 插件开发

```bash
npm install
npm run dev
```

构建发布版：

```bash
npm run build
```
