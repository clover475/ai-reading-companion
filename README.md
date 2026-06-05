# AI Reading Companion / AI 陪读搭子

Obsidian 插件 MVP：在右侧边栏读取当前 Markdown 笔记和选中文本，调用 OpenAI-compatible Chat Completions API，提供陪伴式解释、简化、回应想法、读不进去模式和 Markdown 阅读卡片。

## 项目结构

```text
ai-reading-companion/
├── manifest.json
├── main.js
├── styles.css
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── src/
    ├── main.ts
    ├── settings.ts
    ├── view.ts
    └── api.ts
```

## 本地测试

1. 把整个 `ai-reading-companion` 文件夹放到你的 Obsidian vault：`.obsidian/plugins/ai-reading-companion/`。
2. 打开 Obsidian 设置，进入「第三方插件」，关闭安全模式或启用社区插件。
3. 启用 `AI Reading Companion`。
4. 在插件设置里填写 API Key、Base URL 和 Model。
5. 打开任意 Markdown 笔记，选中一段文字。
6. 点击左侧 ribbon 图标或命令面板里的 `打开 AI 陪读搭子`。
7. 在右侧面板提问或点击快捷按钮。

## 开发

```bash
npm install
npm run dev
```

构建发布版：

```bash
npm run build
```
