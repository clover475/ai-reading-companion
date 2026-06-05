import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { AIReadingCompanionSettingTab, AIReadingCompanionSettings, DEFAULT_SETTINGS } from "./settings";
import { AIReadingCompanionView, VIEW_TYPE_AI_READING_COMPANION } from "./view";

export default class AIReadingCompanionPlugin extends Plugin {
  settings: AIReadingCompanionSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_AI_READING_COMPANION,
      (leaf: WorkspaceLeaf) => new AIReadingCompanionView(leaf, this)
    );

    this.addRibbonIcon("book-open-check", "打开 AI 陪读搭子", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-ai-reading-companion",
      name: "打开 AI 陪读搭子",
      callback: () => this.activateView()
    });

    this.addSettingTab(new AIReadingCompanionSettingTab(this.app, this));

    this.registerInterval(
      window.setInterval(() => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_READING_COMPANION);
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof AIReadingCompanionView) {
            view.refreshSelectionPreview();
          }
        }
      }, 900)
    );
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_READING_COMPANION);
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_READING_COMPANION);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("无法打开右侧边栏。");
      return;
    }

    await leaf.setViewState({
      type: VIEW_TYPE_AI_READING_COMPANION,
      active: true
    });

    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
