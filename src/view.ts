import { ItemView, MarkdownRenderer, MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import AIReadingCompanionPlugin from "./main";
import { callCompanionApi, CompanionAction, CompanionRequest } from "./api";

export const VIEW_TYPE_AI_READING_COMPANION = "ai-reading-companion-view";

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export class AIReadingCompanionView extends ItemView {
  plugin: AIReadingCompanionPlugin;
  previewEl!: HTMLElement;
  inputEl!: HTMLTextAreaElement;
  answerEl!: HTMLElement;
  statusEl!: HTMLElement;
  insertCardButton!: HTMLButtonElement;
  latestCardMarkdown = "";
  lastSelection = "";
  conversation: ConversationTurn[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: AIReadingCompanionPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_AI_READING_COMPANION;
  }

  getDisplayText(): string {
    return "AI 陪读搭子";
  }

  getIcon(): string {
    return "book-open-check";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("ai-reading-companion");

    const header = root.createDiv({ cls: "ai-reading-companion__header" });
    header.createEl("h2", { text: "AI 陪读搭子", cls: "ai-reading-companion__title" });
    const refreshButton = header.createEl("button", { text: "刷新选区" });
    refreshButton.addEventListener("click", () => this.refreshSelectionPreview());

    root.createDiv({ text: "当前选中文本", cls: "ai-reading-companion__section-title" });
    this.previewEl = root.createDiv({ cls: "ai-reading-companion__preview" });

    root.createDiv({ text: "想问什么", cls: "ai-reading-companion__section-title" });
    this.inputEl = root.createEl("textarea", {
      cls: "ai-reading-companion__input",
      attr: { placeholder: "例如：这段什么意思？用产品经理视角解释。这个概念和 RAG 有什么关系？" }
    });

    const primaryRow = root.createDiv({ cls: "ai-reading-companion__button-row" });
    this.createActionButton(primaryRow, "发送", "free");
    this.createActionButton(primaryRow, "解释这段", "explain");
    this.createActionButton(primaryRow, "讲简单一点", "simplify");

    const companionRow = root.createDiv({ cls: "ai-reading-companion__button-row" });
    this.createActionButton(companionRow, "我读不进去了", "stuck");
    this.createActionButton(companionRow, "回应我的想法", "respond");
    this.createActionButton(companionRow, "生成阅读卡片", "card");

    const cardRow = root.createDiv({ cls: "ai-reading-companion__button-row" });
    this.insertCardButton = cardRow.createEl("button", { text: "插入到当前笔记末尾" });
    this.insertCardButton.disabled = true;
    this.insertCardButton.addEventListener("click", () => this.insertLatestCard());

    root.createDiv({ text: "AI 回复", cls: "ai-reading-companion__section-title" });
    this.answerEl = root.createDiv({ cls: "ai-reading-companion__answer" });
    this.statusEl = root.createDiv({ cls: "ai-reading-companion__status" });

    this.refreshSelectionPreview();
  }

  async onClose(): Promise<void> {
    this.containerEl.empty();
  }

  createActionButton(parent: HTMLElement, label: string, action: CompanionAction): void {
    const button = parent.createEl("button", { text: label });
    button.addEventListener("click", () => this.runAction(action));
  }

  refreshSelectionPreview(): void {
    const selectedText = this.getSelectedText();
    this.lastSelection = selectedText;
    this.previewEl.empty();

    if (!selectedText) {
      this.previewEl.createDiv({
        text: "请先在当前 Markdown 笔记中选中一段想一起读的内容。",
        cls: "ai-reading-companion__empty"
      });
      return;
    }

    this.previewEl.setText(selectedText.length > 1200 ? `${selectedText.slice(0, 1200)}...` : selectedText);
  }

  getMarkdownView(): MarkdownView | null {
    const activeMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeMarkdownView) return activeMarkdownView;

    const activeFile = this.app.workspace.getActiveFile();
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of markdownLeaves) {
      if (leaf.view instanceof MarkdownView && leaf.view.file === activeFile) {
        return leaf.view;
      }
    }

    return null;
  }

  getSelectedText(): string {
    const view = this.getMarkdownView();
    if (!view) return "";
    return view.editor.getSelection().trim();
  }

  getSelectionOffset(): number {
    const view = this.getMarkdownView();
    if (!view) return -1;
    try {
      return view.editor.posToOffset(view.editor.getCursor("from"));
    } catch {
      return -1;
    }
  }

  getCurrentFile(): TFile | null {
    return this.getMarkdownView()?.file ?? null;
  }

  buildNoteContext(fullText: string, selectedText: string, selectionOffset: number): string {
    const maxChars = this.plugin.settings.maxContextChars;
    if (fullText.length <= maxChars) return fullText;

    const center = selectionOffset >= 0 ? selectionOffset : fullText.indexOf(selectedText);
    if (center < 0) {
      return `${fullText.slice(0, maxChars)}\n\n[当前笔记过长，已截取前 ${maxChars} 字]`;
    }

    const half = Math.floor(maxChars / 2);
    const start = Math.max(0, center - half);
    const end = Math.min(fullText.length, center + selectedText.length + half);
    const prefix = start > 0 ? "[前文已截断]\n" : "";
    const suffix = end < fullText.length ? "\n[后文已截断]" : "";
    return `${prefix}${fullText.slice(start, end)}${suffix}`;
  }

  conversationAsMarkdown(): string {
    return this.conversation
      .slice(-8)
      .map((turn) => `**${turn.role === "user" ? "我" : "AI"}**：\n${turn.content}`)
      .join("\n\n");
  }

  async runAction(action: CompanionAction): Promise<void> {
    this.refreshSelectionPreview();

    const view = this.getMarkdownView();
    const file = this.getCurrentFile();
    const selectedText = this.lastSelection;
    const userInput = this.inputEl.value.trim();

    if (!view || !file) {
      new Notice("请先打开一个 Markdown 笔记。");
      return;
    }

    if (!selectedText) {
      new Notice("请先选中一段想一起读的内容。");
      return;
    }

    if (action === "respond" && !userInput) {
      new Notice("请先在输入框写下你的想法、困惑或评论。");
      return;
    }

    this.setBusy(true, "正在和 AI 陪读搭子沟通...");

    try {
      const fullText = view.editor.getValue();
      const request: CompanionRequest = {
        action,
        fileName: file.basename,
        noteContext: this.buildNoteContext(fullText, selectedText, this.getSelectionOffset()),
        selectedText,
        userInput,
        conversationMarkdown: this.conversationAsMarkdown()
      };

      const userTurn = this.describeUserTurn(action, userInput);
      this.conversation.push({ role: "user", content: userTurn });

      const answer = await callCompanionApi(this.plugin.settings, request);
      this.conversation.push({ role: "assistant", content: answer });

      if (action === "card") {
        this.latestCardMarkdown = answer;
        this.insertCardButton.disabled = false;
      }

      await this.renderAnswer(answer);
      this.statusEl.setText("完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message);
      this.statusEl.setText(message);
    } finally {
      this.setBusy(false);
    }
  }

  describeUserTurn(action: CompanionAction, userInput: string): string {
    const labels: Record<CompanionAction, string> = {
      free: "自由提问",
      explain: "解释这段",
      simplify: "讲简单一点",
      stuck: "我读不进去了",
      respond: "回应我的想法",
      card: "生成阅读卡片"
    };
    return userInput ? `${labels[action]}：${userInput}` : labels[action];
  }

  async renderAnswer(markdown: string): Promise<void> {
    this.answerEl.empty();
    await MarkdownRenderer.render(this.app, markdown, this.answerEl, "", this);
  }

  setBusy(isBusy: boolean, status = ""): void {
    this.statusEl.setText(status);
    const buttons = this.containerEl.querySelectorAll("button");
    buttons.forEach((button) => {
      if (button === this.insertCardButton) {
        (button as HTMLButtonElement).disabled = isBusy || !this.latestCardMarkdown;
        return;
      }
      (button as HTMLButtonElement).disabled = isBusy;
    });
  }

  async insertLatestCard(): Promise<void> {
    if (!this.latestCardMarkdown) {
      new Notice("还没有可插入的阅读卡片。");
      return;
    }

    const view = this.getMarkdownView();
    if (!view) {
      new Notice("请先打开要插入卡片的 Markdown 笔记。");
      return;
    }

    const current = view.editor.getValue();
    const card = this.latestCardMarkdown.trim();
    view.editor.setValue(`${current.trimEnd()}\n\n---\n\n${card}\n`);
    new Notice("已插入到当前笔记末尾。");
  }
}
